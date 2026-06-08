DROP POLICY IF EXISTS "Admins update non-owner roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete non-owner roles" ON public.user_roles;

CREATE POLICY "Admins update non-owner roles of others"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
  AND user_id <> auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
  AND user_id <> auth.uid()
);

CREATE POLICY "Admins delete non-owner roles of others"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'owner'::app_role
  AND user_id <> auth.uid()
);