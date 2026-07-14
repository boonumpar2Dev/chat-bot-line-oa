CREATE TABLE public.ai_rollout_reactivation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  prev_ai_active boolean NOT NULL,
  prev_manual_chat_until timestamptz,
  prev_status text NOT NULL,
  reactivated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_rollout_batch ON public.ai_rollout_reactivation_log(batch_id);
CREATE INDEX idx_ai_rollout_customer ON public.ai_rollout_reactivation_log(customer_id);

GRANT SELECT ON public.ai_rollout_reactivation_log TO authenticated;
GRANT ALL ON public.ai_rollout_reactivation_log TO service_role;

ALTER TABLE public.ai_rollout_reactivation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read rollout log" ON public.ai_rollout_reactivation_log
  FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));