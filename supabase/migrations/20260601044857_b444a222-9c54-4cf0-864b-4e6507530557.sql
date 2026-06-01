
-- Merge multiple source tags into a single target tag
CREATE OR REPLACE FUNCTION public.merge_tags(_source_names text[], _target_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int := 0;
  src_clean text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _target_name IS NULL OR btrim(_target_name) = '' THEN
    RAISE EXCEPTION 'target name required';
  END IF;

  -- exclude target from sources to avoid self-merge weirdness
  SELECT array_agg(x) INTO src_clean
    FROM unnest(_source_names) AS x
    WHERE x IS NOT NULL AND x <> '' AND x <> _target_name;

  IF src_clean IS NULL OR array_length(src_clean,1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Ensure target tag exists in master list
  INSERT INTO public.tags (name, color)
  VALUES (_target_name, '#94a3b8')
  ON CONFLICT (name) DO NOTHING;

  -- Replace source tag names with target on each customer that has any of them
  WITH updated AS (
    UPDATE public.customers c
       SET tags = (
         SELECT array_agg(DISTINCT t)
           FROM unnest(c.tags) AS x(t_in),
                LATERAL (SELECT CASE WHEN x.t_in = ANY(src_clean) THEN _target_name ELSE x.t_in END AS t) t
       )
     WHERE c.tags && src_clean
     RETURNING c.id
  )
  SELECT count(*) INTO affected FROM updated;

  -- Delete source tags from master list
  DELETE FROM public.tags WHERE name = ANY(src_clean);

  RETURN affected;
END
$$;

-- Bulk delete tags: remove from master + strip from all customers
CREATE OR REPLACE FUNCTION public.bulk_delete_tags(_names text[], _strip_from_customers boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _names IS NULL OR array_length(_names,1) IS NULL THEN
    RETURN 0;
  END IF;

  IF _strip_from_customers THEN
    WITH updated AS (
      UPDATE public.customers c
         SET tags = COALESCE(
           (SELECT array_agg(t) FROM unnest(c.tags) AS t WHERE NOT (t = ANY(_names))),
           '{}'::text[]
         )
       WHERE c.tags && _names
       RETURNING c.id
    )
    SELECT count(*) INTO affected FROM updated;
  END IF;

  DELETE FROM public.tags WHERE name = ANY(_names);
  RETURN affected;
END
$$;
