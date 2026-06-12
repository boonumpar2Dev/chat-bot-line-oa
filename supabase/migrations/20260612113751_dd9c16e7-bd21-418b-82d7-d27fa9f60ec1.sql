
-- 1. customer_notes column for per-customer AI notes
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. kb_suggestions table
CREATE TABLE IF NOT EXISTS public.kb_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_q text NOT NULL,
  suggested_a text NOT NULL,
  source_message_ids uuid[] NOT NULL DEFAULT '{}',
  customer_ids uuid[] NOT NULL DEFAULT '{}',
  occurrence_count int NOT NULL DEFAULT 1,
  category_id uuid NULL REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  scan_from date,
  scan_to date,
  strictness text CHECK (strictness IN ('strict','medium','loose')),
  dismissed_embedding vector(3072),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  knowledge_base_id uuid REFERENCES public.knowledge_base(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_suggestions TO authenticated;
GRANT ALL ON public.kb_suggestions TO service_role;

ALTER TABLE public.kb_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view kb_suggestions"
  ON public.kb_suggestions FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));

CREATE POLICY "Admins can manage kb_suggestions"
  ON public.kb_suggestions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'owner'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'owner'::app_role)
  );

CREATE TRIGGER set_kb_suggestions_updated_at
  BEFORE UPDATE ON public.kb_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS kb_suggestions_status_idx ON public.kb_suggestions(status, created_at DESC);

-- 3. app_settings: last scan metadata
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS kb_suggest_last_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS kb_suggest_strictness text NOT NULL DEFAULT 'medium';
