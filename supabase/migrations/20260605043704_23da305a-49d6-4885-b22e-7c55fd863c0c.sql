
-- 1) Prevent admins from creating/modifying 'owner' rows (privilege escalation)
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

CREATE POLICY "Admins insert non-owner roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
);

CREATE POLICY "Admins update non-owner roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
);

CREATE POLICY "Admins delete non-owner roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
);

-- 2) Restrict app_settings SELECT to staff members (was: any authenticated)
DROP POLICY IF EXISTS "Auth read app_settings" ON public.app_settings;

CREATE POLICY "Staff read app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.is_staff_member(auth.uid()));
