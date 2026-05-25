ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS ai_whitelist_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_whitelist_user_ids text[] NOT NULL DEFAULT '{}'::text[];