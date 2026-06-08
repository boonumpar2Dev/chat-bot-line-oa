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
  pending_confirm_tag text;
  new_tag text;
  returning_tag text;
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

  merged := COALESCE(NEW.tags, '{}');

  -- Strip "รอคอนเฟิร์ม" only when moving to confirmed/confirmed_returning/cancelled/postponed
  pending_confirm_tag := cfg->'status_tag_map'->>'pending_confirm';
  IF TG_OP = 'UPDATE'
     AND pending_confirm_tag IS NOT NULL AND pending_confirm_tag <> ''
     AND NEW.status::text IN ('confirmed','confirmed_returning','cancelled','postponed') THEN
    SELECT COALESCE(array_agg(x), '{}') INTO merged
      FROM unnest(merged) AS x WHERE x <> pending_confirm_tag;
  END IF;

  -- ADD ONLY merge
  SELECT array_agg(DISTINCT x) INTO merged
    FROM unnest(COALESCE(merged,'{}') || COALESCE(new_tags,'{}')) AS x
    WHERE x IS NOT NULL AND x <> '';

  -- บ้าน vs บริษัท
  IF 'บริษัท' = ANY(COALESCE(new_tags,'{}')) THEN
    SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
  ELSIF 'บ้าน' = ANY(COALESCE(new_tags,'{}')) THEN
    IF 'บริษัท' = ANY(COALESCE(OLD.tags,'{}')) THEN
      SELECT array_agg(x) INTO merged FROM unnest(merged) AS x WHERE x <> 'บ้าน';
    END IF;
  END IF;

  -- ถ้ามี "ลูกค้าเก่า" → ลบ "ลูกค้าใหม่"
  new_tag       := cfg->'status_tag_map'->>'new';
  returning_tag := cfg->'status_tag_map'->>'returning';
  IF returning_tag IS NOT NULL AND returning_tag <> ''
     AND new_tag IS NOT NULL AND new_tag <> ''
     AND returning_tag = ANY(COALESCE(merged,'{}')) THEN
    SELECT COALESCE(array_agg(x), '{}') INTO merged
      FROM unnest(merged) AS x WHERE x <> new_tag;
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