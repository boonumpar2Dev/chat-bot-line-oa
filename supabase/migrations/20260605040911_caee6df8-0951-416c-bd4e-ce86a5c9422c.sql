ALTER TABLE public.tags
  DROP COLUMN IF EXISTS ai_instruction,
  DROP COLUMN IF EXISTS ai_enabled;