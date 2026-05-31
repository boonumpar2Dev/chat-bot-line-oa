
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS auto_tag_settings jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "locale": "th",
    "year_format": "be",
    "month_format": "short_th",
    "status_tag_map": {
      "confirmed": "ยืนยัน",
      "cancelled": "ยกเลิก",
      "pending_quote": "รอเสนอราคา",
      "pending_confirm": "รอยืนยัน"
    },
    "custom_name_rules": []
  }'::jsonb;

-- Pure function: compute auto tags from (nickname, status, config)
CREATE OR REPLACE FUNCTION public.compute_auto_tags(_nickname text, _status text, _cfg jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text[] := '{}';
  month_num int;
  year_num int;
  be_year int;
  ce_year int;
  month_tag text;
  year_tag text;
  status_tag text;
  rule jsonb;
  month_fmt text := COALESCE(_cfg->>'month_format', 'short_th');
  year_fmt  text := COALESCE(_cfg->>'year_format', 'be');
  short_th  text[] := ARRAY['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  full_th   text[] := ARRAY['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  short_en  text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  full_en   text[] := ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'];
  i int;
BEGIN
  IF _nickname IS NOT NULL THEN
    -- 1) Full Thai
    FOR i IN 1..12 LOOP
      IF _nickname ~ full_th[i] THEN month_num := i; EXIT; END IF;
    END LOOP;
    -- 2) Full English
    IF month_num IS NULL THEN
      FOR i IN 1..12 LOOP
        IF _nickname ~* full_en[i] THEN month_num := i; EXIT; END IF;
      END LOOP;
    END IF;
    -- 3) Short Thai (มค / ม.ค.)
    IF month_num IS NULL THEN
      IF    _nickname ~ 'มี\.?ค\.?'  THEN month_num := 3;
      ELSIF _nickname ~ 'เม\.?ย\.?'  THEN month_num := 4;
      ELSIF _nickname ~ 'มิ\.?ย\.?'  THEN month_num := 6;
      ELSIF _nickname ~ 'ม\.?ค\.?'   THEN month_num := 1;
      ELSIF _nickname ~ 'ก\.?พ\.?'   THEN month_num := 2;
      ELSIF _nickname ~ 'พ\.?ค\.?'   THEN month_num := 5;
      ELSIF _nickname ~ 'ก\.?ค\.?'   THEN month_num := 7;
      ELSIF _nickname ~ 'ส\.?ค\.?'   THEN month_num := 8;
      ELSIF _nickname ~ 'ก\.?ย\.?'   THEN month_num := 9;
      ELSIF _nickname ~ 'ต\.?ค\.?'   THEN month_num := 10;
      ELSIF _nickname ~ 'พ\.?ย\.?'   THEN month_num := 11;
      ELSIF _nickname ~ 'ธ\.?ค\.?'   THEN month_num := 12;
      END IF;
    END IF;
    -- 4) Short English
    IF month_num IS NULL THEN
      FOR i IN 1..12 LOOP
        IF _nickname ~* ('(^|[^a-z])' || short_en[i] || '([^a-z]|$)') THEN month_num := i; EXIT; END IF;
      END LOOP;
    END IF;

    -- Year: prefer 4-digit, else 2-digit (assume BE 25xx)
    BEGIN
      year_num := (regexp_match(_nickname, '(\d{4})'))[1]::int;
    EXCEPTION WHEN OTHERS THEN year_num := NULL; END;
    IF year_num IS NULL THEN
      BEGIN
        year_num := (regexp_match(_nickname, '(?<!\d)(\d{2})(?!\d)'))[1]::int;
        IF year_num IS NOT NULL THEN year_num := 2500 + year_num; END IF;
      EXCEPTION WHEN OTHERS THEN year_num := NULL; END;
    END IF;
  END IF;

  -- Format month tag
  IF month_num IS NOT NULL THEN
    month_tag := CASE month_fmt
      WHEN 'full_th'  THEN full_th[month_num]
      WHEN 'short_en' THEN short_en[month_num]
      WHEN 'full_en'  THEN full_en[month_num]
      WHEN 'number'   THEN lpad(month_num::text, 2, '0')
      ELSE short_th[month_num]
    END;
    result := array_append(result, month_tag);
  END IF;

  -- Format year tag
  IF year_num IS NOT NULL THEN
    IF year_num > 2400 THEN be_year := year_num; ce_year := year_num - 543;
    ELSE be_year := year_num + 543; ce_year := year_num;
    END IF;
    year_tag := CASE year_fmt WHEN 'ce' THEN ce_year::text ELSE be_year::text END;
    result := array_append(result, year_tag);
  END IF;

  -- Status tag
  IF _status IS NOT NULL THEN
    status_tag := _cfg->'status_tag_map'->>_status;
    IF status_tag IS NOT NULL AND status_tag <> '' THEN
      result := array_append(result, status_tag);
    END IF;
  END IF;

  -- Custom regex rules
  IF jsonb_typeof(_cfg->'custom_name_rules') = 'array' AND _nickname IS NOT NULL THEN
    FOR rule IN SELECT * FROM jsonb_array_elements(_cfg->'custom_name_rules') LOOP
      IF COALESCE(rule->>'pattern','') <> '' AND COALESCE(rule->>'tag','') <> '' THEN
        BEGIN
          IF COALESCE(rule->>'flags','') ILIKE '%i%' THEN
            IF _nickname ~* (rule->>'pattern') THEN
              result := array_append(result, rule->>'tag');
            END IF;
          ELSE
            IF _nickname ~ (rule->>'pattern') THEN
              result := array_append(result, rule->>'tag');
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN result;
END
$$;

-- Trigger: accumulate tags on insert/update of nickname or status
CREATE OR REPLACE FUNCTION public.apply_auto_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  new_tags text[];
  merged text[];
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

  SELECT array_agg(DISTINCT t)
    INTO merged
    FROM unnest(COALESCE(NEW.tags, '{}') || COALESCE(new_tags, '{}')) AS t
    WHERE t IS NOT NULL AND t <> '';

  NEW.tags := COALESCE(merged, '{}');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS customers_auto_tag ON public.customers;
CREATE TRIGGER customers_auto_tag
  BEFORE INSERT OR UPDATE OF nickname, status ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.apply_auto_tags();
