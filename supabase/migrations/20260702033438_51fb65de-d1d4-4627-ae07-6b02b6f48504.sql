CREATE INDEX IF NOT EXISTS idx_customers_ai_active_true
  ON public.customers (last_message_at DESC NULLS LAST)
  WHERE ai_active = true;