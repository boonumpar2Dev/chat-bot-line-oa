DROP POLICY IF EXISTS "Allow authenticated" ON public.customer_status_log;

CREATE POLICY "Staff can view status log" ON public.customer_status_log
  FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));

CREATE POLICY "Staff can insert status log" ON public.customer_status_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_member(auth.uid()));

CREATE POLICY "Staff can update status log" ON public.customer_status_log
  FOR UPDATE TO authenticated
  USING (public.is_staff_member(auth.uid()))
  WITH CHECK (public.is_staff_member(auth.uid()));

CREATE POLICY "Staff can delete status log" ON public.customer_status_log
  FOR DELETE TO authenticated
  USING (public.is_staff_member(auth.uid()));