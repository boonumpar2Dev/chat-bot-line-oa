
CREATE OR REPLACE FUNCTION public.apply_auto_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb;
  new_tags text[];
  merged text[];
  tg text;
  status_tag_values text[] := '{}';
  v text;
BEGIN
  SELECT auto_tag_settings INTO cfg FROM app_settings LIMIT 1;
  IF cfg IS NULL OR COALESCE((cfg->>'enabled')::boolean, true) = false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.nickname IS NOT DISTINCT FROM OLD.nickname
     AND NEW.status   IS NOT DISTINCT FROM OLD.status
     AND NEW.tax_id   IS NOT DISTINCT FROM OLD.tax_id THEN
    RETURN NEW;
  END IF;

  new_tags := public.compute_auto_tags(NEW.nickname, NEW.status::text, cfg, NEW.tax_id);

  IF jsonb_typeof(cfg->'status_tag_map') = 'object' THEN
    FOR v IN SELECT value FROM jsonb_each_text(cfg->'status_tag_map') LOOP
      IF v IS NOT NULL AND v <> '' THEN
        status_tag_values := array_append(status_tag_values, v);
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(array_agg(x), '{}') INTO merged
    FROM unnest(COALESCE(NEW.tags,'{}')) AS x
    WHERE NOT (x = ANY(status_tag_values));

  SELECT array_agg(DISTINCT x) INTO merged
    FROM unnest(COALESCE(merged,'{}') || COALESCE(new_tags,'{}')) AS x
    WHERE x IS NOT NULL AND x <> '';

  IF 'บริษัท' = ANY(COALESCE(new_tags,'{}')) THEN
    SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
  ELSIF 'บ้าน' = ANY(COALESCE(new_tags,'{}')) THEN
    IF NOT ('บริษัท' = ANY(COALESCE(OLD.tags,'{}'))) THEN
      SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บริษัท';
    ELSE
      SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.rescan_auto_tags()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb; rec record; new_tags text[]; merged text[]; n int := 0; tg text;
  status_tag_values text[] := '{}'; v text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;

  IF jsonb_typeof(cfg->'status_tag_map') = 'object' THEN
    FOR v IN SELECT value FROM jsonb_each_text(cfg->'status_tag_map') LOOP
      IF v IS NOT NULL AND v <> '' THEN
        status_tag_values := array_append(status_tag_values, v);
      END IF;
    END LOOP;
  END IF;

  FOR rec IN SELECT id, nickname, status::text AS status, tags, tax_id FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg, rec.tax_id);
    IF new_tags IS NOT NULL THEN
      FOREACH tg IN ARRAY new_tags LOOP
        IF tg IS NOT NULL AND tg <> '' THEN
          INSERT INTO public.tags (name, color) VALUES (tg, '#94a3b8') ON CONFLICT (name) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    SELECT COALESCE(array_agg(x), '{}') INTO merged
      FROM unnest(COALESCE(rec.tags,'{}')) AS x
      WHERE NOT (x = ANY(status_tag_values));

    SELECT array_agg(DISTINCT x) INTO merged
      FROM unnest(COALESCE(merged,'{}') || COALESCE(new_tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> '';

    IF 'บริษัท' = ANY(COALESCE(new_tags,'{}')) THEN
      SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
    ELSIF 'บ้าน' = ANY(COALESCE(new_tags,'{}')) THEN
      IF NOT ('บริษัท' = ANY(COALESCE(rec.tags,'{}'))) THEN
        SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บริษัท';
      ELSE
        SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
      END IF;
    END IF;

    IF COALESCE(merged,'{}') IS DISTINCT FROM COALESCE(rec.tags,'{}') THEN
      UPDATE public.customers SET tags = COALESCE(merged,'{}') WHERE id = rec.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END
$function$;
