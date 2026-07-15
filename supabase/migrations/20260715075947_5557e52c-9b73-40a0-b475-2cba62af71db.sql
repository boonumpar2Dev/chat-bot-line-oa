
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_category text,
  ADD COLUMN IF NOT EXISTS handoff_question text,
  ADD COLUMN IF NOT EXISTS handoff_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_handoff_at ON public.customers(handoff_at DESC) WHERE handoff_at IS NOT NULL;
