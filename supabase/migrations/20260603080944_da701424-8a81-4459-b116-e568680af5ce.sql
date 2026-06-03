
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS handover_extract_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handover_extract_timeout_ms integer NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS handover_extract_triggers jsonb NOT NULL DEFAULT '["phone","tax_id","postcap"]'::jsonb,
  ADD COLUMN IF NOT EXISTS handover_extract_overwrite_mode text NOT NULL DEFAULT 'fill_only';
