
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP POLICY "Auth write app_settings" ON public.app_settings;
CREATE POLICY "Auth write app_settings" ON public.app_settings FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Auth write package_categories" ON public.package_categories;
CREATE POLICY "Auth write package_categories" ON public.package_categories FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Auth write catering_packages" ON public.catering_packages;
CREATE POLICY "Auth write catering_packages" ON public.catering_packages FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Auth write promotions" ON public.promotions;
CREATE POLICY "Auth write promotions" ON public.promotions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Auth write customers" ON public.customers;
CREATE POLICY "Auth write customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Auth write conversations" ON public.conversations;
CREATE POLICY "Auth write conversations" ON public.conversations FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
