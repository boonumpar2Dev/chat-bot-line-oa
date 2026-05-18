CREATE TABLE public.user_menu_permissions (
  user_id uuid PRIMARY KEY,
  menu_keys text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own menu permissions"
  ON public.user_menu_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage user_menu_permissions"
  ON public.user_menu_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_user_menu_permissions_updated
  BEFORE UPDATE ON public.user_menu_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();