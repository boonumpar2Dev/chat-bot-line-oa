ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS debounce_seconds numeric NOT NULL DEFAULT 15;