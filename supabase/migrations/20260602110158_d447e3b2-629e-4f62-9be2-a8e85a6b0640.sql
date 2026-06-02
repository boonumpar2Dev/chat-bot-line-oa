
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS out_of_hours_message text NOT NULL DEFAULT 'ขอบคุณที่ติดต่อมาค่ะ 🙏 ขณะนี้อยู่นอกเวลาทำการ เจ้าหน้าที่จะรีบติดต่อกลับโดยเร็วที่สุดนะคะ',
  ADD COLUMN IF NOT EXISTS out_of_hours_message_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unable_to_reply_message text NOT NULL DEFAULT 'ขอบคุณที่สอบถามนะคะ 🙏 ขอส่งเรื่องให้เจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับโดยเร็วที่สุดค่ะ',
  ADD COLUMN IF NOT EXISTS unable_to_reply_enabled boolean NOT NULL DEFAULT true;

-- Backfill bot_mode จาก flag เดิม
UPDATE public.app_settings
SET bot_mode = CASE
  WHEN ai_enabled = false AND ai_whitelist_enabled = false THEN 'off'
  WHEN ai_whitelist_enabled = true THEN 'whitelist'
  WHEN schedule_enabled = true THEN 'scheduled'
  ELSE 'full'
END
WHERE key = 'ai_config';

-- ย้ายข้อความ fallback เดิม → unable_to_reply_message (เฉพาะถ้ามีค่าและไม่ว่าง)
UPDATE public.app_settings
SET unable_to_reply_message = fallback_message
WHERE key = 'ai_config' AND fallback_message IS NOT NULL AND length(trim(fallback_message)) > 0;
