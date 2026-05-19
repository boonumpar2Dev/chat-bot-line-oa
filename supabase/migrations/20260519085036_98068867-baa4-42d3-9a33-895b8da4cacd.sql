ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS post_phone_max_replies integer NOT NULL DEFAULT 3;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_saved_at timestamptz;

-- backfill phone_saved_at สำหรับลูกค้าที่มีเบอร์อยู่แล้ว ใช้ updated_at เป็น proxy
UPDATE public.customers
SET phone_saved_at = updated_at
WHERE phone IS NOT NULL AND phone <> '' AND phone_saved_at IS NULL;