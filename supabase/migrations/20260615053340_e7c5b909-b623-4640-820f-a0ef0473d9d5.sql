
CREATE OR REPLACE FUNCTION public.rescan_auto_tags(_mode text DEFAULT 'missing')
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb; rec record; new_tags text[]; merged text[]; n int := 0; tg text;
  managed text[] := '{}';
  has_any_auto boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _mode NOT IN ('missing','all_additive','reset') THEN
    RAISE EXCEPTION 'invalid mode: %', _mode;
  END IF;

  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;

  managed := public.managed_auto_tags(cfg);

  FOR rec IN SELECT id, nickname, status::text AS status, tags, tax_id FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg, rec.tax_id);

    -- Mode: missing -> skip customers that already have any auto-tag
    IF _mode = 'missing' THEN
      SELECT EXISTS (
        SELECT 1 FROM unnest(COALESCE(rec.tags,'{}')) AS x WHERE x = ANY(managed)
      ) INTO has_any_auto;
      IF has_any_auto THEN
        CONTINUE;
      END IF;
    END IF;

    -- Mode: reset -> strip all managed auto-tags from current
    IF _mode = 'reset' THEN
      SELECT COALESCE(array_agg(x), '{}') INTO merged
        FROM unnest(COALESCE(rec.tags,'{}')) AS x
        WHERE NOT (x = ANY(managed));
    ELSE
      merged := COALESCE(rec.tags, '{}');
    END IF;

    -- Register new tag names
    IF new_tags IS NOT NULL THEN
      FOREACH tg IN ARRAY new_tags LOOP
        IF tg IS NOT NULL AND tg <> '' THEN
          INSERT INTO public.tags (name, color) VALUES (tg, '#94a3b8') ON CONFLICT (name) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- Additive merge
    SELECT array_agg(DISTINCT x) INTO merged
      FROM unnest(COALESCE(merged,'{}') || COALESCE(new_tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> '';

    -- บ้าน vs บริษัท conflict
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
