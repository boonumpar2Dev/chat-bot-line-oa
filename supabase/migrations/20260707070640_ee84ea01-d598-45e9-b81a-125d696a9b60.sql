ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS company_phones jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.app_settings
SET company_phones = '["021019296","0891454922","0829661999","0993828787"]'::jsonb
WHERE key = 'ai_config'
  AND (company_phones IS NULL OR company_phones = '[]'::jsonb);