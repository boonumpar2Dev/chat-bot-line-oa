
-- 1) Add KB entry: combined image of all 3 package types
INSERT INTO public.knowledge_base (title, content, category, image_urls, status, sort_order)
VALUES (
  'ภาพรวม 3 รูปแบบแพ็กเกจ (จัดงานบุญ / ซุ้มอาหาร / โต๊ะจีน)',
  'บุญนำพามี 3 รูปแบบให้เลือก:
1) แพ็กเกจจัดงานบุญ (Standard/อิ่มบุญ/ครบวงจร 1-9) — งานบุญพร้อมอาหารคาว ขนมหวาน น้ำสมุนไพร
2) แพ็กเกจโต๊ะจีน 1/2/3 (Standard/Premium/Elite) — งานเลี้ยงโต๊ะจีน
3) แพ็กเกจครบวงจร + ซุ้มอาหาร BNP — งานบุญครบวงจร + ซุ้มอาหารถวายพระ
ใช้รูปนี้แสดงภาพรวมเมื่อลูกค้ายังไม่ระบุรูปแบบที่สนใจ',
  'ข้อมูลพื้นฐานแพ็กเกจ',
  ARRAY['https://xfyrzvazzqaienlpumzq.supabase.co/storage/v1/object/public/line-media/knowledge%2Fpackages-combined-3types.jpg']::text[],
  'active',
  0
);

-- 2) Add strict rule: ask service type first when type unknown
UPDATE public.app_settings
SET strict_rules = strict_rules || ARRAY[
  '🎯 ถ้าลูกค้ายังไม่ระบุรูปแบบ (จัดงานบุญ/ซุ้มอาหาร/โต๊ะจีน) → ห้ามส่ง tier images หรือเสนอแพ็กเกจเฉพาะรูปแบบใดรูปแบบหนึ่ง | ให้ส่งรูป "ภาพรวม 3 รูปแบบแพ็กเกจ" (image_titles) + ถามสั้นๆ ว่าสนใจรูปแบบไหน (จัดงานบุญ / เพิ่มซุ้มอาหาร / โต๊ะจีน) — แม้ลูกค้าจะบอกจำนวนแขกแล้วก็ตาม'
]::text[]
WHERE key = 'ai_config';
