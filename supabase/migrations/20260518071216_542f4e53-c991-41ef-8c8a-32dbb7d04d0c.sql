ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS bundle_image_titles text[] NOT NULL DEFAULT '{}';

UPDATE public.app_settings
SET strict_rules = array_cat(
  COALESCE(strict_rules, '{}'::text[]),
  ARRAY[
    'เลือก tier ตาม capacity: ลูกค้าบอก "แขก N" = ต้องการรองรับแขก N คน (ไม่นับพระ) → เลือก tier ที่ guest_pax ≥ N เท่านั้น ห้ามเสนอ tier ที่ guest_pax น้อยกว่าจำนวนแขกที่ลูกค้าต้องการเด็ดขาด',
    'ก่อนเสนอแพ็ก ให้เช็ก "แขกสูงสุด" ของแต่ละ tier ในแคตตาล็อก ถ้าทุก tier ของแพ็กนั้น capacity ไม่พอ → ข้ามไปแพ็กถัดไป หรือบอกลูกค้าว่าต้องสอบถามทีมงาน ห้ามแนะนำแพ็กที่ไม่พอ'
  ]
)
WHERE NOT (
  'เลือก tier ตาม capacity: ลูกค้าบอก "แขก N" = ต้องการรองรับแขก N คน (ไม่นับพระ) → เลือก tier ที่ guest_pax ≥ N เท่านั้น ห้ามเสนอ tier ที่ guest_pax น้อยกว่าจำนวนแขกที่ลูกค้าต้องการเด็ดขาด' = ANY(COALESCE(strict_rules, '{}'::text[]))
);