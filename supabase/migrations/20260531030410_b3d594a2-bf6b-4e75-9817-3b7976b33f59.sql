
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#94a3b8',
  description text,
  ai_tag_instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read tags"
ON public.tags FOR SELECT TO authenticated
USING (is_staff_member(auth.uid()));

CREATE POLICY "Admin write tags"
ON public.tags FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed จาก tag ที่มีในลูกค้าเดิม
INSERT INTO public.tags (name, color, sort_order)
SELECT DISTINCT unnest(tags) AS name, '#94a3b8', 0
FROM public.customers
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
ON CONFLICT (name) DO NOTHING;
