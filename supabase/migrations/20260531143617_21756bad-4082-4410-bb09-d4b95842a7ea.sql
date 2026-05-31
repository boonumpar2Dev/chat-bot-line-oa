CREATE OR REPLACE FUNCTION public.rescan_auto_tags()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb;
  rec record;
  new_tags text[];
  managed text[];
  cleaned text[];
  merged text[];
  n int := 0;
  tg text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  managed := public.managed_auto_tags(cfg);

  FOR rec IN SELECT id, nickname, status::text AS status, tags FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg);

    IF new_tags IS NOT NULL THEN
      FOREACH tg IN ARRAY new_tags LOOP
        IF tg IS NOT NULL AND tg <> '' THEN
          INSERT INTO public.tags (name, color)
          VALUES (tg, '#94a3b8')
          ON CONFLICT (name) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    SELECT array_agg(x) INTO cleaned
      FROM unnest(COALESCE(rec.tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> ''
        AND NOT (x = ANY(managed))
        AND x !~ '^\d{4}$';

    SELECT array_agg(DISTINCT x) INTO merged
      FROM unnest(COALESCE(cleaned,'{}') || COALESCE(new_tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> '';

    IF COALESCE(merged,'{}') IS DISTINCT FROM COALESCE(rec.tags,'{}') THEN
      UPDATE public.customers SET tags = COALESCE(merged,'{}') WHERE id = rec.id;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END
$function$;

CREATE OR REPLACE FUNCTION public.apply_auto_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb;
  new_tags text[];
  managed text[];
  cleaned text[];
  merged text[];
  tg text;
BEGIN
  SELECT auto_tag_settings INTO cfg FROM app_settings LIMIT 1;
  IF cfg IS NULL OR COALESCE((cfg->>'enabled')::boolean, true) = false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.nickname IS NOT DISTINCT FROM OLD.nickname
     AND NEW.status   IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  new_tags := public.compute_auto_tags(NEW.nickname, NEW.status::text, cfg);
  managed  := public.managed_auto_tags(cfg);

  SELECT array_agg(x) INTO cleaned
    FROM unnest(COALESCE(NEW.tags,'{}')) AS x
    WHERE x IS NOT NULL AND x <> ''
      AND NOT (x = ANY(managed))
      AND x !~ '^\d{4}$';

  SELECT array_agg(DISTINCT x) INTO merged
    FROM unnest(COALESCE(cleaned,'{}') || COALESCE(new_tags,'{}')) AS x
    WHERE x IS NOT NULL AND x <> '';

  NEW.tags := COALESCE(merged, '{}');

  IF new_tags IS NOT NULL THEN
    FOREACH tg IN ARRAY new_tags LOOP
      IF tg IS NOT NULL AND tg <> '' THEN
        INSERT INTO public.tags (name, color)
        VALUES (tg, '#94a3b8')
        ON CONFLICT (name) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END
$function$;