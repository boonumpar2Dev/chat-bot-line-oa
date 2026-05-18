CREATE TABLE public.role_menu_permissions (
  role app_role PRIMARY KEY,
  menu_keys text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read role_menu_permissions"
  ON public.role_menu_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage role_menu_permissions"
  ON public.role_menu_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_role_menu_permissions_updated
  BEFORE UPDATE ON public.role_menu_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.role_menu_permissions (role, menu_keys) VALUES
  ('manager', ARRAY['dashboard','chats','knowledge','settings']),
  ('staff',   ARRAY['chats'])
ON CONFLICT (role) DO NOTHING;