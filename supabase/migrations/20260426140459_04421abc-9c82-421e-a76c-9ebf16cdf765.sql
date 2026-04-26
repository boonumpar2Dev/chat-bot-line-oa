ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('line-media', 'line-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read line-media" ON storage.objects FOR SELECT USING (bucket_id = 'line-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth upload line-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'line-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.app_settings (key)
SELECT 'ai_config'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_config');