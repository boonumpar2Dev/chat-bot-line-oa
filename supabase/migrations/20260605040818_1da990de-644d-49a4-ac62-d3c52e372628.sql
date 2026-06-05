ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS ai_instruction text,
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;