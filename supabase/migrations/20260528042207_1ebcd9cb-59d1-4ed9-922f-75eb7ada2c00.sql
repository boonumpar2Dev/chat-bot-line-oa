-- 1) customer_events: snapshot ประวัติงานเก่าแต่ละงาน
CREATE TABLE public.customer_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  event_type text,
  guest_count integer,
  event_date date,
  venue text,
  package_name text,
  total_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_events_customer ON public.customer_events(customer_id, event_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_events TO authenticated;
GRANT ALL ON public.customer_events TO service_role;

ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read customer_events" ON public.customer_events
  FOR SELECT TO authenticated USING (is_staff_member(auth.uid()));
CREATE POLICY "Staff write customer_events" ON public.customer_events
  FOR ALL TO authenticated USING (is_staff_member(auth.uid())) WITH CHECK (is_staff_member(auth.uid()));

-- 2) app_settings: ฟิลด์ใหม่สำหรับ returning customer
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS returning_customer_greeting text NOT NULL DEFAULT 'ยินดีต้อนรับกลับนะคะคุณ{ชื่อ} 🙏 มีงานอะไรให้ทีมงานช่วยดูแลคะ?',
  ADD COLUMN IF NOT EXISTS vip_customer_greeting text NOT NULL DEFAULT 'สวัสดีค่ะคุณ{ชื่อ} ขอบคุณที่กลับมาใช้บริการอีกครั้งนะคะ 🙏 รอบนี้สนใจงานแบบไหนคะ?',
  ADD COLUMN IF NOT EXISTS returning_skip_intent_questions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS returning_days_threshold integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS returning_context_instruction text NOT NULL DEFAULT 'ลูกค้ารายนี้เคยติดต่อ/ใช้บริการมาก่อน — ห้ามทักทายเหมือนลูกค้าใหม่ ห้ามถามข้อมูลพื้นฐานซ้ำที่เคยรู้ ให้คุยต่อจากบริบทเดิม อ้างถึงงานที่เคยจัดถ้ามีประวัติ และเสนอแพ็กเกจที่ใกล้เคียงกับที่เคยสนใจก่อน';