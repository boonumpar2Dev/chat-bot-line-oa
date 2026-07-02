
DROP POLICY IF EXISTS "Admins update non-owner roles of others" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete non-owner roles of others" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert non-owner roles" ON public.user_roles;

-- Admins can only manage manager/staff roles (never admin or owner) to prevent privilege escalation.
CREATE POLICY "Admins update manager/staff roles of others"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('manager'::app_role, 'staff'::app_role)
  AND user_id <> auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('manager'::app_role, 'staff'::app_role)
  AND user_id <> auth.uid()
);

CREATE POLICY "Admins delete manager/staff roles of others"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('manager'::app_role, 'staff'::app_role)
  AND user_id <> auth.uid()
);

CREATE POLICY "Admins insert manager/staff roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('manager'::app_role, 'staff'::app_role)
  AND user_id <> auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = user_roles.user_id
  )
);
