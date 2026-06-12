ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS shop_address text,
  ADD COLUMN IF NOT EXISTS shop_lat numeric,
  ADD COLUMN IF NOT EXISTS shop_lng numeric;