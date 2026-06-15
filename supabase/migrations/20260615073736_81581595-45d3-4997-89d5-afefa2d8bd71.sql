
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS admin_seen_at timestamptz;
UPDATE public.customers SET admin_seen_at = now() WHERE admin_seen_at IS NULL;
