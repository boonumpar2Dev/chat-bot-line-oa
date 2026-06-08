
-- Restrict SELECT on internal operational tables to staff members only
DROP POLICY IF EXISTS "Auth read promotions" ON public.promotions;
CREATE POLICY "Staff read promotions" ON public.promotions FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read catering_packages" ON public.catering_packages;
CREATE POLICY "Staff read catering_packages" ON public.catering_packages FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read package_categories" ON public.package_categories;
CREATE POLICY "Staff read package_categories" ON public.package_categories FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read knowledge_categories" ON public.knowledge_categories;
CREATE POLICY "Staff read knowledge_categories" ON public.knowledge_categories FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read knowledge_base" ON public.knowledge_base;
CREATE POLICY "Staff read knowledge_base" ON public.knowledge_base FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read auto_responses" ON public.auto_responses;
CREATE POLICY "Staff read auto_responses" ON public.auto_responses FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read ai_context_cache" ON public.ai_context_cache;
CREATE POLICY "Staff read ai_context_cache" ON public.ai_context_cache FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Auth read role_menu_permissions" ON public.role_menu_permissions;
CREATE POLICY "Staff read role_menu_permissions" ON public.role_menu_permissions FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));
