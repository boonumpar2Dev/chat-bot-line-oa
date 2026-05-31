
-- helper: admin OR owner
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','owner')
  )
$$;

-- ai_token_usage: owner only
DROP POLICY IF EXISTS "Admins read ai_token_usage" ON public.ai_token_usage;
CREATE POLICY "Owner read ai_token_usage" ON public.ai_token_usage
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

-- line_config: admin + owner
DROP POLICY IF EXISTS "Admins read line_config" ON public.line_config;
DROP POLICY IF EXISTS "Admins write line_config" ON public.line_config;
CREATE POLICY "Admin or owner read line_config" ON public.line_config
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admin or owner write line_config" ON public.line_config
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- user_roles: owner can also view all + manage
CREATE POLICY "Owner view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owner manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- user_menu_permissions: owner can manage
CREATE POLICY "Owner manage user_menu_permissions" ON public.user_menu_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- profiles: owner view all
CREATE POLICY "Owner view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

-- upgrade first user (oldest admin) to owner
UPDATE public.user_roles
SET role = 'owner'::app_role
WHERE user_id = (
  SELECT user_id FROM public.user_roles
  WHERE role = 'admin'::app_role
  ORDER BY created_at ASC
  LIMIT 1
);

-- update handle_new_user: first user → owner; else staff
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END $$;
