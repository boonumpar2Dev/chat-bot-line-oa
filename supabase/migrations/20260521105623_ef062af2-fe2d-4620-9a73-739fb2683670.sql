
CREATE TABLE public.line_config (
  id integer PRIMARY KEY DEFAULT 1,
  channel_access_token text NOT NULL DEFAULT '',
  channel_secret text NOT NULL DEFAULT '',
  channel_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT line_config_singleton CHECK (id = 1)
);

ALTER TABLE public.line_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read line_config"
  ON public.line_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write line_config"
  ON public.line_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_line_config_updated_at
  BEFORE UPDATE ON public.line_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.line_config (id) VALUES (1) ON CONFLICT DO NOTHING;
