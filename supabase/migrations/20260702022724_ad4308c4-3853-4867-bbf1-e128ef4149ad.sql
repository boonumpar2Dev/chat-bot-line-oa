
CREATE TABLE public.customer_reset_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  reset_by_user_id UUID,
  reset_by_email TEXT,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_tables_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  reset_fields_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customer_reset_audit_logs_customer_idx
  ON public.customer_reset_audit_logs (customer_id, reset_at DESC);
CREATE INDEX customer_reset_audit_logs_user_idx
  ON public.customer_reset_audit_logs (reset_by_user_id, reset_at DESC);

GRANT SELECT ON public.customer_reset_audit_logs TO authenticated;
GRANT ALL ON public.customer_reset_audit_logs TO service_role;

ALTER TABLE public.customer_reset_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view reset audit logs"
  ON public.customer_reset_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));
