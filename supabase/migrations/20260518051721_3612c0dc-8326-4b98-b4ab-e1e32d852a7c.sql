ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS comparison_phase_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comparison_kb_category text;