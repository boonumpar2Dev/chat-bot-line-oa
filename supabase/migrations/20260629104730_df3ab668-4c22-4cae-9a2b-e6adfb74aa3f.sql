CREATE INDEX IF NOT EXISTS idx_customers_ai_active_false
  ON public.customers (id)
  WHERE ai_active = false;

CREATE INDEX IF NOT EXISTS idx_customers_phone_null
  ON public.customers (id)
  WHERE phone IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_status_phone_not_null
  ON public.customers (status, id)
  WHERE phone IS NOT NULL;