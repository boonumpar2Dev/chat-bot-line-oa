
CREATE TABLE public.ai_reply_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  line_user_id text,
  conv_id uuid,
  customer_message text,
  ai_reply text,
  ai_reply_bubbles jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_titles text[] NOT NULL DEFAULT '{}',
  intent_extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  recent_context text,
  status text NOT NULL DEFAULT 'sent',
  error text
);

GRANT SELECT ON public.ai_reply_audit TO authenticated;
GRANT ALL ON public.ai_reply_audit TO service_role;

ALTER TABLE public.ai_reply_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/admin/manager can view AI reply audit"
  ON public.ai_reply_audit FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE INDEX idx_ai_reply_audit_created_at ON public.ai_reply_audit (created_at DESC);
CREATE INDEX idx_ai_reply_audit_customer ON public.ai_reply_audit (customer_id, created_at DESC);
CREATE INDEX idx_ai_reply_audit_status ON public.ai_reply_audit (status, created_at DESC);
