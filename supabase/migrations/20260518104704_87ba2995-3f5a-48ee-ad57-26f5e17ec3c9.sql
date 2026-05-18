
CREATE TABLE IF NOT EXISTS public.ai_context_cache (
  key text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  token_count integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_context_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read ai_context_cache" ON public.ai_context_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth write ai_context_cache" ON public.ai_context_cache
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS summary_until_message_id uuid;
