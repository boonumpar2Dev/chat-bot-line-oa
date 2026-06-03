-- Broadcast campaigns + recipients

CREATE TABLE public.broadcast_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  target_tags text[] NOT NULL DEFAULT '{}',
  target_statuses text[] NOT NULL DEFAULT '{}',
  target_match_mode text NOT NULL DEFAULT 'any',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz NULL,
  sent_at timestamptz NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_campaigns TO service_role;

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read broadcast_campaigns"
  ON public.broadcast_campaigns FOR SELECT TO authenticated
  USING (is_staff_member(auth.uid()));

CREATE POLICY "Admin write broadcast_campaigns"
  ON public.broadcast_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER update_broadcast_campaigns_updated_at
  BEFORE UPDATE ON public.broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_broadcast_campaigns_status ON public.broadcast_campaigns(status);
CREATE INDEX idx_broadcast_campaigns_scheduled_at ON public.broadcast_campaigns(scheduled_at) WHERE status = 'scheduled';

CREATE TABLE public.broadcast_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NULL,
  line_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT ALL ON public.broadcast_recipients TO service_role;

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read broadcast_recipients"
  ON public.broadcast_recipients FOR SELECT TO authenticated
  USING (is_staff_member(auth.uid()));

CREATE POLICY "Admin write broadcast_recipients"
  ON public.broadcast_recipients FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE INDEX idx_broadcast_recipients_campaign ON public.broadcast_recipients(campaign_id);
CREATE INDEX idx_broadcast_recipients_status ON public.broadcast_recipients(status);