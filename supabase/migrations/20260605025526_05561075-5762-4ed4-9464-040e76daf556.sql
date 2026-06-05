
CREATE OR REPLACE FUNCTION public.bulk_add_tag(_tag_name text, _customer_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'manager'::app_role)
       OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _tag_name IS NULL OR btrim(_tag_name) = '' THEN
    RAISE EXCEPTION 'tag name required';
  END IF;
  IF _customer_ids IS NULL OR array_length(_customer_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.tags (name, color) VALUES (_tag_name, '#94a3b8')
  ON CONFLICT (name) DO NOTHING;

  WITH updated AS (
    UPDATE public.customers c
       SET tags = (
         SELECT array_agg(DISTINCT x)
         FROM unnest(COALESCE(c.tags, '{}'::text[]) || ARRAY[_tag_name]) AS x
         WHERE x IS NOT NULL AND x <> ''
       )
     WHERE c.id = ANY(_customer_ids)
       AND NOT (_tag_name = ANY(COALESCE(c.tags, '{}'::text[])))
     RETURNING c.id
  )
  SELECT count(*) INTO affected FROM updated;

  RETURN affected;
END
$$;
