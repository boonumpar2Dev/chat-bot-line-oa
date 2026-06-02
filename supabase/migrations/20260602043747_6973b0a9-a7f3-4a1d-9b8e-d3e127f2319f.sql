
-- Add owner to write policies on tables that previously only allowed admin+manager
DROP POLICY IF EXISTS "Admin write tags" ON public.tags;
CREATE POLICY "Admin write tags" ON public.tags FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write app_settings" ON public.app_settings;
CREATE POLICY "Admin write app_settings" ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write auto_responses" ON public.auto_responses;
CREATE POLICY "Admin write auto_responses" ON public.auto_responses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write catering_packages" ON public.catering_packages;
CREATE POLICY "Admin write catering_packages" ON public.catering_packages FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write knowledge_base" ON public.knowledge_base;
CREATE POLICY "Admin write knowledge_base" ON public.knowledge_base FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write knowledge_categories" ON public.knowledge_categories;
CREATE POLICY "Admin write knowledge_categories" ON public.knowledge_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write promotions" ON public.promotions;
CREATE POLICY "Admin write promotions" ON public.promotions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

DROP POLICY IF EXISTS "Admin write ai_context_cache" ON public.ai_context_cache;
CREATE POLICY "Admin write ai_context_cache" ON public.ai_context_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'owner'::app_role));

-- Update RPCs to include owner
CREATE OR REPLACE FUNCTION public.rescan_auto_tags()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb; rec record; new_tags text[]; managed text[]; cleaned text[]; merged text[]; n int := 0; tg text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT auto_tag_settings INTO cfg FROM public.app_settings LIMIT 1;
  IF cfg IS NULL THEN RETURN 0; END IF;
  managed := public.managed_auto_tags(cfg);
  FOR rec IN SELECT id, nickname, status::text AS status, tags FROM public.customers LOOP
    new_tags := public.compute_auto_tags(rec.nickname, rec.status, cfg);
    IF new_tags IS NOT NULL THEN
      FOREACH tg IN ARRAY new_tags LOOP
        IF tg IS NOT NULL AND tg <> '' THEN
          INSERT INTO public.tags (name, color) VALUES (tg, '#94a3b8') ON CONFLICT (name) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
    SELECT array_agg(x) INTO cleaned FROM unnest(COALESCE(rec.tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> '' AND NOT (x = ANY(managed)) AND x !~ '^\d{4}$';
    SELECT array_agg(DISTINCT x) INTO merged FROM unnest(COALESCE(cleaned,'{}') || COALESCE(new_tags,'{}')) AS x
      WHERE x IS NOT NULL AND x <> '';
    IF COALESCE(merged,'{}') IS DISTINCT FROM COALESCE(rec.tags,'{}') THEN
      UPDATE public.customers SET tags = COALESCE(merged,'{}') WHERE id = rec.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END
$function$;

CREATE OR REPLACE FUNCTION public.bulk_delete_tags(_names text[], _strip_from_customers boolean DEFAULT true)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE affected int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _names IS NULL OR array_length(_names,1) IS NULL THEN RETURN 0; END IF;
  IF _strip_from_customers THEN
    WITH updated AS (
      UPDATE public.customers c
         SET tags = COALESCE((SELECT array_agg(t) FROM unnest(c.tags) AS t WHERE NOT (t = ANY(_names))), '{}'::text[])
       WHERE c.tags && _names RETURNING c.id
    ) SELECT count(*) INTO affected FROM updated;
  END IF;
  DELETE FROM public.tags WHERE name = ANY(_names);
  RETURN affected;
END
$function$;

CREATE OR REPLACE FUNCTION public.merge_tags(_source_names text[], _target_name text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE affected int := 0; src_clean text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _target_name IS NULL OR btrim(_target_name) = '' THEN RAISE EXCEPTION 'target name required'; END IF;
  SELECT array_agg(x) INTO src_clean FROM unnest(_source_names) AS x
    WHERE x IS NOT NULL AND x <> '' AND x <> _target_name;
  IF src_clean IS NULL OR array_length(src_clean,1) IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.tags (name, color) VALUES (_target_name, '#94a3b8') ON CONFLICT (name) DO NOTHING;
  WITH updated AS (
    UPDATE public.customers c
       SET tags = (
         SELECT array_agg(DISTINCT t)
           FROM unnest(c.tags) AS x(t_in),
                LATERAL (SELECT CASE WHEN x.t_in = ANY(src_clean) THEN _target_name ELSE x.t_in END AS t) t
       )
     WHERE c.tags && src_clean RETURNING c.id
  ) SELECT count(*) INTO affected FROM updated;
  DELETE FROM public.tags WHERE name = ANY(src_clean);
  RETURN affected;
END
$function$;
