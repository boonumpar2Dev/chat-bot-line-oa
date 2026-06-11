-- A) Add positive rule about offering all package types for large events
UPDATE public.app_settings
SET strict_rules = array_append(
  COALESCE(strict_rules, '{}'),
  '✅ แขก ≥40 ท่าน (งานบุญ/บวช/ทำบุญ/เลี้ยงทั่วไป): ต้องเสนอ **ครบทุกประเภทที่มีใน KB** (โต๊ะจีน/บุฟเฟ่ต์/ซุ้มอาหาร) พร้อมราคา tier ที่เหมาะกับจำนวนแขก ห้ามตัดประเภทใดทิ้งเอง — ให้ลูกค้าเป็นฝ่ายเลือก | ยกเว้นลูกค้าระบุชัดว่าต้องการแบบใดแบบหนึ่ง'
)
WHERE key = 'ai_config'
  AND NOT (
    'แขก ≥40 ท่าน' = ANY(COALESCE(strict_rules, '{}'))
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(strict_rules, '{}')) r
      WHERE r LIKE '%≥40%ครบทุกประเภท%'
    )
  );

-- B) Add packages_retrieved column to audit table
ALTER TABLE public.ai_reply_audit
  ADD COLUMN IF NOT EXISTS packages_retrieved jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_retrieved jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS system_prompt_excerpt text;