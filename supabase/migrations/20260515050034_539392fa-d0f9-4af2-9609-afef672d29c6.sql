ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS video_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.catering_packages ADD COLUMN IF NOT EXISTS video_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS video_urls jsonb NOT NULL DEFAULT '[]'::jsonb;