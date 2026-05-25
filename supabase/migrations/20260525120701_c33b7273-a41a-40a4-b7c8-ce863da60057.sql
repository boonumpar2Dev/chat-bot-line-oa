ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS reply_length integer NOT NULL DEFAULT 60,
ADD COLUMN IF NOT EXISTS reply_bubbles integer NOT NULL DEFAULT 3;