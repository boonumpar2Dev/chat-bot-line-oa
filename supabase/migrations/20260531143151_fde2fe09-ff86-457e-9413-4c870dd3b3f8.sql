-- A: Sync auto-tag triggers to master tags table (idempotent upsert)
-- Add unique constraint on tags.name if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_name_key'
  ) THEN
    ALTER TABLE public.tags ADD CONSTRAINT tags_name_key UNIQUE (name);
  END IF;
END $$;

-- Update apply_auto_tags trigger function to also insert new tag names into master tags table
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
  t text;
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

  -- Auto-sync new tag names into master tags table (idempotent)
  IF new_tags IS NOT NULL THEN
    FOREACH t IN ARRAY new_tags LOOP
      IF t IS NOT NULL AND t <> '' THEN
        INSERT INTO public.tags (name, color)
        VALUES (t, '#94a3b8')
        ON CONFLICT (name) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END
$function$;

-- Update rescan_auto_tags to also sync into master tags table
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
  t text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  managed := public.managed_auto_tags(cfg);

  FOR rec IN SELECT id, nickname, status::text AS status, tags FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg);

    -- Sync new tags into master tags table
    IF new_tags IS NOT NULL THEN
      FOREACH t IN ARRAY new_tags LOOP
        IF t IS NOT NULL AND t <> '' THEN
          INSERT INTO public.tags (name, color)
          VALUES (t, '#94a3b8')
          ON CONFLICT (name) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

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
$function$;

-- Ensure trigger exists on customers (BEFORE INSERT/UPDATE)
DROP TRIGGER IF EXISTS apply_auto_tags_trigger ON public.customers;
CREATE TRIGGER apply_auto_tags_trigger
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.apply_auto_tags();