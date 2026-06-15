
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS admin_unseen boolean
  GENERATED ALWAYS AS (
    admin_seen_at IS NULL
    OR (last_message_at IS NOT NULL AND admin_seen_at < last_message_at)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_customers_first_priority
  ON public.customers(last_sender, admin_unseen)
  WHERE last_sender = 'ai' AND admin_unseen = true AND phone IS NOT NULL;
