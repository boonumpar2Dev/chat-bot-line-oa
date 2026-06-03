CREATE TABLE public.ai_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  customer_id uuid,
  line_user_id text,
  conv_id uuid,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_delivery_logs_created_at ON public.ai_delivery_logs (created_at DESC);
CREATE INDEX idx_ai_delivery_logs_severity ON public.ai_delivery_logs (severity, created_at DESC);

GRANT SELECT ON public.ai_delivery_logs TO authenticated;
GRANT ALL ON public.ai_delivery_logs TO service_role;

ALTER TABLE public.ai_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read ai_delivery_logs"
ON public.ai_delivery_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));

ALTER TABLE public.ai_delivery_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_delivery_logs;