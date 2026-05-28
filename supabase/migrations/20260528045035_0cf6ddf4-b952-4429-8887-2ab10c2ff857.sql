
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS intent_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS intent_fields jsonb NOT NULL DEFAULT '[
    {
      "key": "service_type",
      "label": "รูปแบบงาน",
      "values": ["บุฟเฟ่ต์", "ซุ้มอาหาร", "โต๊ะจีน"],
      "required": true,
      "instruction": "ถ้ารู้รูปแบบงานแล้ว ห้ามถามซ้ำเด็ดขาด ให้ส่งรูปเมนูที่ตรงรูปแบบทันทีเมื่อลูกค้าขอดูเมนู"
    },
    {
      "key": "dietary",
      "label": "ข้อจำกัดอาหาร",
      "values": [],
      "required": false,
      "instruction": "ถ้าลูกค้าแจ้งข้อจำกัด (เช่น ไม่ทานเนื้อ, แพ้อาหารทะเล) ให้เก็บไว้ และอย่าเสนอเมนูที่ขัด"
    },
    {
      "key": "monk_count",
      "label": "จำนวนพระ",
      "values": [],
      "required": false,
      "instruction": "จำนวนพระ (รูป) — แยกจาก guest_count"
    }
  ]'::jsonb;
