
-- Helper: is the user any internal staff member?
CREATE OR REPLACE FUNCTION public.is_staff_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','staff')
  )
$$;

-- Revoke from anon (not needed) and grant to authenticated explicitly
REVOKE EXECUTE ON FUNCTION public.is_staff_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;

-- ============ CUSTOMERS ============
DROP POLICY IF EXISTS "Auth read customers" ON public.customers;
DROP POLICY IF EXISTS "Auth write customers" ON public.customers;
CREATE POLICY "Staff read customers" ON public.customers FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));
CREATE POLICY "Staff write customers" ON public.customers FOR ALL TO authenticated
  USING (public.is_staff_member(auth.uid()))
  WITH CHECK (public.is_staff_member(auth.uid()));

-- ============ CONVERSATIONS ============
DROP POLICY IF EXISTS "Auth read conversations" ON public.conversations;
DROP POLICY IF EXISTS "Auth write conversations" ON public.conversations;
CREATE POLICY "Staff read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));
CREATE POLICY "Staff write conversations" ON public.conversations FOR ALL TO authenticated
  USING (public.is_staff_member(auth.uid()))
  WITH CHECK (public.is_staff_member(auth.uid()));

-- ============ APP SETTINGS (admin/manager only for writes) ============
DROP POLICY IF EXISTS "Auth write app_settings" ON public.app_settings;
CREATE POLICY "Admin write app_settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- ============ AI CONTEXT CACHE (admin/manager writes; service role bypasses RLS) ============
DROP POLICY IF EXISTS "Auth write ai_context_cache" ON public.ai_context_cache;
CREATE POLICY "Admin write ai_context_cache" ON public.ai_context_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- ============ AUTO RESPONSES ============
DROP POLICY IF EXISTS "Auth write auto_responses" ON public.auto_responses;
CREATE POLICY "Admin write auto_responses" ON public.auto_responses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- ============ KNOWLEDGE BASE / CATEGORIES / PACKAGES / PROMOTIONS ============
DROP POLICY IF EXISTS "Auth write knowledge_base" ON public.knowledge_base;
CREATE POLICY "Admin write knowledge_base" ON public.knowledge_base FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Auth write knowledge_categories" ON public.knowledge_categories;
CREATE POLICY "Admin write knowledge_categories" ON public.knowledge_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Auth write catering_packages" ON public.catering_packages;
CREATE POLICY "Admin write catering_packages" ON public.catering_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Auth write promotions" ON public.promotions;
CREATE POLICY "Admin write promotions" ON public.promotions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- ============ REALTIME AUTHORIZATION ============
-- Restrict Realtime channel subscriptions to staff members only
DROP POLICY IF EXISTS "Staff can use realtime" ON realtime.messages;
CREATE POLICY "Staff can use realtime" ON realtime.messages FOR SELECT TO authenticated
  USING (public.is_staff_member((select auth.uid())));

-- ============ STORAGE: prevent listing of line-media bucket ============
-- Public bucket still serves files via direct URL; this only stops object listing
DROP POLICY IF EXISTS "Public read line-media" ON storage.objects;
