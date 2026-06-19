DROP POLICY IF EXISTS "Admins insert non-owner roles" ON public.user_roles;
CREATE POLICY "Admins insert non-owner roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'owner'::app_role
    AND user_id <> auth.uid()
  );