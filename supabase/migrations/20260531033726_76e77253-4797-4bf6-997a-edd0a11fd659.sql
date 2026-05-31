
CREATE OR REPLACE FUNCTION public.rescan_auto_tags()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  rec record;
  new_tags text[];
  merged text[];
  n int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;

  FOR rec IN SELECT id, nickname, status::text AS status, tags FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg);
    SELECT array_agg(DISTINCT t)
      INTO merged
      FROM unnest(COALESCE(rec.tags,'{}') || COALESCE(new_tags,'{}')) AS t
      WHERE t IS NOT NULL AND t <> '';
    IF COALESCE(merged,'{}') IS DISTINCT FROM COALESCE(rec.tags,'{}') THEN
      UPDATE public.customers SET tags = COALESCE(merged,'{}') WHERE id = rec.id;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rescan_auto_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rescan_auto_tags() TO authenticated;
