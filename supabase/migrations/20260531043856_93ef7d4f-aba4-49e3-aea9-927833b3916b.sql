
-- 1) Add 'inquiry' enum value to customer_status
ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'inquiry';

-- 2) Update default status_tag_map in app_settings
UPDATE public.app_settings
SET auto_tag_settings = jsonb_set(
  auto_tag_settings,
  '{status_tag_map}',
  '{
    "new": "ลูกค้าใหม่",
    "returning": "ลูกค้าเก่า",
    "inquiry": "ลูกค้ากลุ่มคาดหวัง",
    "pending_quote": "รอเสนอราคา",
    "pending_confirm": "รอคอนเฟิร์ม",
    "confirmed": "คอนเฟิร์ม",
    "cancelled": "ยกเลิก"
  }'::jsonb
);

-- Change column default too
ALTER TABLE public.app_settings
  ALTER COLUMN auto_tag_settings SET DEFAULT '{
    "enabled": true,
    "locale": "th",
    "year_format": "be",
    "month_format": "short_th",
    "status_tag_map": {
      "new": "ลูกค้าใหม่",
      "returning": "ลูกค้าเก่า",
      "inquiry": "ลูกค้ากลุ่มคาดหวัง",
      "pending_quote": "รอเสนอราคา",
      "pending_confirm": "รอคอนเฟิร์ม",
      "confirmed": "คอนเฟิร์ม",
      "cancelled": "ยกเลิก"
    },
    "custom_name_rules": []
  }'::jsonb;

-- 3) Fix compute_auto_tags: pick LAST digit group for year
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
  m text[];
  last_match text;
  month_fmt text := COALESCE(_cfg->>'month_format', 'short_th');
  year_fmt  text := COALESCE(_cfg->>'year_format', 'be');
  short_th  text[] := ARRAY['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  full_th   text[] := ARRAY['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  short_en  text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  full_en   text[] := ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'];
  i int;
BEGIN
  IF _nickname IS NOT NULL THEN
    FOR i IN 1..12 LOOP
      IF _nickname ~ full_th[i] THEN month_num := i; EXIT; END IF;
    END LOOP;
    IF month_num IS NULL THEN
      FOR i IN 1..12 LOOP
        IF _nickname ~* full_en[i] THEN month_num := i; EXIT; END IF;
      END LOOP;
    END IF;
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
    IF month_num IS NULL THEN
      FOR i IN 1..12 LOOP
        IF _nickname ~* ('(^|[^a-z])' || short_en[i] || '([^a-z]|$)') THEN month_num := i; EXIT; END IF;
      END LOOP;
    END IF;

    -- Year: pick LAST 4-digit; else LAST 2-digit (assume BE 25xx)
    last_match := NULL;
    FOR m IN SELECT regexp_matches(_nickname, '(\d{4})', 'g') LOOP
      last_match := m[1];
    END LOOP;
    IF last_match IS NOT NULL THEN
      year_num := last_match::int;
    ELSE
      FOR m IN SELECT regexp_matches(_nickname, '(?<!\d)(\d{2})(?!\d)', 'g') LOOP
        last_match := m[1];
      END LOOP;
      IF last_match IS NOT NULL THEN
        year_num := 2500 + last_match::int;
      END IF;
    END IF;
  END IF;

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

  IF year_num IS NOT NULL THEN
    IF year_num > 2400 THEN be_year := year_num; ce_year := year_num - 543;
    ELSE be_year := year_num + 543; ce_year := year_num;
    END IF;
    year_tag := CASE year_fmt WHEN 'ce' THEN ce_year::text ELSE be_year::text END;
    result := array_append(result, year_tag);
  END IF;

  IF _status IS NOT NULL THEN
    status_tag := _cfg->'status_tag_map'->>_status;
    IF status_tag IS NOT NULL AND status_tag <> '' THEN
      result := array_append(result, status_tag);
    END IF;
  END IF;

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

-- 4) Helper: build "managed auto-tag" set from cfg (all possible month formats + status map values + custom rule tags)
CREATE OR REPLACE FUNCTION public.managed_auto_tags(_cfg jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  managed text[] := '{}';
  v text;
  rule jsonb;
  short_th text[] := ARRAY['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  full_th  text[] := ARRAY['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  short_en text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  full_en  text[] := ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'];
  i int;
BEGIN
  managed := managed || short_th || full_th || short_en || full_en;
  FOR i IN 1..12 LOOP managed := array_append(managed, lpad(i::text,2,'0')); END LOOP;
  -- status_tag_map values
  IF jsonb_typeof(_cfg->'status_tag_map') = 'object' THEN
    FOR v IN SELECT value FROM jsonb_each_text(_cfg->'status_tag_map') LOOP
      IF v IS NOT NULL AND v <> '' THEN managed := array_append(managed, v); END IF;
    END LOOP;
  END IF;
  -- custom rule tags
  IF jsonb_typeof(_cfg->'custom_name_rules') = 'array' THEN
    FOR rule IN SELECT * FROM jsonb_array_elements(_cfg->'custom_name_rules') LOOP
      v := rule->>'tag';
      IF v IS NOT NULL AND v <> '' THEN managed := array_append(managed, v); END IF;
    END LOOP;
  END IF;
  RETURN managed;
END
$$;

-- 5) Trigger: strip managed tags + 4-digit years before merging new
CREATE OR REPLACE FUNCTION public.apply_auto_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  new_tags text[];
  managed text[];
  cleaned text[];
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
  managed  := public.managed_auto_tags(cfg);

  SELECT array_agg(t) INTO cleaned
    FROM unnest(COALESCE(NEW.tags,'{}')) AS t
    WHERE t IS NOT NULL AND t <> ''
      AND NOT (t = ANY(managed))
      AND t !~ '^\d{4}$';

  SELECT array_agg(DISTINCT t) INTO merged
    FROM unnest(COALESCE(cleaned,'{}') || COALESCE(new_tags,'{}')) AS t
    WHERE t IS NOT NULL AND t <> '';

  NEW.tags := COALESCE(merged, '{}');
  RETURN NEW;
END
$$;

-- 6) Rescan: same clean-then-apply logic
CREATE OR REPLACE FUNCTION public.rescan_auto_tags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  rec record;
  new_tags text[];
  managed text[];
  cleaned text[];
  merged text[];
  n int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  managed := public.managed_auto_tags(cfg);

  FOR rec IN SELECT id, nickname, status::text AS status, tags FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg);

    SELECT array_agg(t) INTO cleaned
      FROM unnest(COALESCE(rec.tags,'{}')) AS t
      WHERE t IS NOT NULL AND t <> ''
        AND NOT (t = ANY(managed))
        AND t !~ '^\d{4}$';

    SELECT array_agg(DISTINCT t) INTO merged
      FROM unnest(COALESCE(cleaned,'{}') || COALESCE(new_tags,'{}')) AS t
      WHERE t IS NOT NULL AND t <> '';

    IF COALESCE(merged,'{}') IS DISTINCT FROM COALESCE(rec.tags,'{}') THEN
      UPDATE public.customers SET tags = COALESCE(merged,'{}') WHERE id = rec.id;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END
$$;
