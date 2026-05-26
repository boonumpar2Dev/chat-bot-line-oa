ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS image_rule_no_extra text NOT NULL DEFAULT 'ถามเรื่องชิม/ค่าส่ง/เงื่อนไข/ราคาเฉยๆ → ห้ามแถมรูปเมนูหรือตัวอย่างทุกประเภท',
  ADD COLUMN IF NOT EXISTS image_rule_no_format text NOT NULL DEFAULT 'บอกจำนวนแขกแล้วแต่ยังไม่ระบุรูปแบบ (บุฟเฟ่ต์/ซุ้ม/โต๊ะจีน) → ส่งภาพรวม 3 รูปแบบก่อนเสมอ',
  ADD COLUMN IF NOT EXISTS image_rule_no_repeat text NOT NULL DEFAULT 'เคยส่งรูปเปรียบเทียบแล้วและลูกค้าตัดสินใจแล้ว → ห้ามส่งรูปเปรียบเทียบซ้ำ ตอบข้อความล้วนแทน';