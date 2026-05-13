-- Create knowledge_categories table
CREATE TABLE public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read knowledge_categories" ON public.knowledge_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth write knowledge_categories" ON public.knowledge_categories
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Seed from existing distinct categories in knowledge_base
INSERT INTO public.knowledge_categories (name)
SELECT DISTINCT TRIM(category)
FROM public.knowledge_base
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;

-- Drop unused tags column
ALTER TABLE public.knowledge_base DROP COLUMN IF EXISTS tags;