CREATE TABLE public.ai_token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  source text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  cost_usd numeric(12,8) NOT NULL DEFAULT 0,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_token_usage_created ON public.ai_token_usage (created_at DESC);
CREATE INDEX idx_ai_token_usage_model_created ON public.ai_token_usage (model, created_at DESC);
CREATE INDEX idx_ai_token_usage_source_created ON public.ai_token_usage (source, created_at DESC);

ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read ai_token_usage"
ON public.ai_token_usage FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));