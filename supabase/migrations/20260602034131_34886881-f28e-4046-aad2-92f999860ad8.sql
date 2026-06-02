DROP POLICY IF EXISTS "Auth write package_categories" ON public.package_categories;

CREATE POLICY "Admin/manager write package_categories"
ON public.package_categories
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));