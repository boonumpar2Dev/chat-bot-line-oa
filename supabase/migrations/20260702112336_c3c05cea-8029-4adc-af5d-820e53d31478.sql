
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS advanced_ai_status_policy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_policy_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_chat_minutes integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.app_settings.advanced_ai_status_policy_enabled IS 'Feature flag: เปิด AI Policy Layer แบบใหม่ (status-aware). Default=false → ระบบเดิมทำงานเหมือนเดิม 100%';
COMMENT ON COLUMN public.app_settings.ai_policy_config IS 'Per-status toggle + config สำหรับ AI Policy Layer (ใช้เฉพาะเมื่อ advanced flag เปิด)';
COMMENT ON COLUMN public.app_settings.manual_chat_minutes IS 'ระยะพัก AI หลังแอดมินตอบ (นาที) — ใช้เฉพาะเมื่อ advanced flag เปิด. Legacy manual_chat_hours ยังใช้เมื่อ flag=false';
