
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS handover_summary_header text NOT NULL DEFAULT '📋 สรุปข้อมูลที่ได้รับ:',
  ADD COLUMN IF NOT EXISTS handover_summary_fields jsonb NOT NULL DEFAULT '[
    {"key":"nickname","label":"ชื่อ","enabled":true},
    {"key":"phone","label":"เบอร์โทร","enabled":true},
    {"key":"tax_id","label":"เลขผู้เสียภาษี/Tag","enabled":true},
    {"key":"event_type","label":"ประเภทงาน","enabled":true},
    {"key":"venue","label":"สถานที่/จังหวัด","enabled":true},
    {"key":"event_date","label":"วันจัดงาน","enabled":true},
    {"key":"guest_count","label":"จำนวนคน","suffix":" ท่าน","enabled":true}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS handover_intro_phone text NOT NULL DEFAULT 'ขอบคุณสำหรับข้อมูลค่ะ บันทึกเบอร์โทร {phone} เรียบร้อยแล้ว

จะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยนะคะ',
  ADD COLUMN IF NOT EXISTS handover_intro_tax text NOT NULL DEFAULT 'รับทราบค่ะ ได้รับข้อมูลเลขผู้เสียภาษี/Tag {tax_id} เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏',
  ADD COLUMN IF NOT EXISTS handover_intro_postcap text NOT NULL DEFAULT 'ขอบคุณที่สอบถามนะคะ 🙏 เดี๋ยวเจ้าหน้าที่ติดต่อกลับไปสรุปรายละเอียดให้ค่ะ';
