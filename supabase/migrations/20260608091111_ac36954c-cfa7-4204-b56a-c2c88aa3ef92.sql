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

  -- ADD ONLY: merge new tags into existing without stripping any
  SELECT array_agg(DISTINCT x) INTO merged
    FROM unnest(COALESCE(NEW.tags,'{}') || COALESCE(new_tags,'{}')) AS x
    WHERE x IS NOT NULL AND x <> '';

  -- บ้าน vs บริษัท: ถ้าใหม่เป็นบริษัทให้ถอด บ้าน, ถ้าเป็น บ้าน แต่เดิมมี บริษัท คงไว้
  IF 'บริษัท' = ANY(COALESCE(new_tags,'{}')) THEN
    SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
  ELSIF 'บ้าน' = ANY(COALESCE(new_tags,'{}')) THEN
    IF 'บริษัท' = ANY(COALESCE(OLD.tags,'{}')) THEN
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