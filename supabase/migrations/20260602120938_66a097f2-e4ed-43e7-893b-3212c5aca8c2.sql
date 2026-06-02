ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS followup_instruction text
    DEFAULT 'ทักลูกค้าแบบสุภาพ สั้น กระชับ อ้างอิงสิ่งที่คุยกันไว้ก่อนหน้า (เช่น วันจัดงาน ประเภทงาน จำนวนแขก สถานที่) เพื่อสอบถามว่าลูกค้ายังสนใจอยู่ไหม และขอเบอร์ติดต่อกลับ ห้ามตื๊อ ห้ามถามซ้ำสิ่งที่ลูกค้าตอบไปแล้ว ใช้คำว่า "ครับ/ค่ะ" ให้เหมาะกับ persona';

-- ซิงก์ flag ให้ตรงกับ bot_mode (กัน state ค้างจากของเก่า)
UPDATE public.app_settings
SET
  schedule_enabled      = (bot_mode = 'scheduled'),
  ai_whitelist_enabled  = (bot_mode = 'whitelist'),
  ai_enabled            = (bot_mode <> 'off')
WHERE key = 'ai_config' AND bot_mode IS NOT NULL;