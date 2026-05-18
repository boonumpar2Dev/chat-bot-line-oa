## ทำไม B ดีกว่าระยะยาว

**ปัญหาของ A (เพิ่ม rule):**
- AI ยังต้องตีความเองทุกครั้ง → พลาดได้เรื่อย ๆ
- ทุกครั้งที่เพิ่มแพ็กใหม่ ต้องมา maintain KB เปรียบเทียบคู่ขนาน (data ซ้ำซ้อน 2 ที่)
- ราคา/เมนูเปลี่ยน ต้องแก้ 2 ที่ (catalog + KB) — ลืมที่ใดที่หนึ่ง = AI ตอบขัดกันเอง
- KB เปรียบเทียบที่ hardcode จำนวนคน (เช่น "40 ท่าน") จะชนกับลูกค้าที่บอกตัวเลขใกล้เคียงเสมอ

**ข้อดีของ B:**
- Source of truth เดียว: ราคา + ระดับคุณภาพ อยู่ใน `catering_packages.pricing_tiers` ที่เดียว
- AI เลือก tier ตาม capacity ก่อน → แสดงระดับคุณภาพในนั้น = logic ตรงไปตรงมา ไม่มีโอกาสพลาด
- เพิ่ม/ลด/แก้ราคา ทำที่เดียว
- ลบ KB เปรียบเทียบทิ้งได้หมด (ลดข้อมูลซ้ำ)

**ฐานข้อมูล:** ขยาย JSON ใน column เดิม ไม่เพิ่ม table ไม่เพิ่ม row — แทบไม่กระทบขนาดเลย

---

## โครงสร้างใหม่ของ `pricing_tiers`

จาก (ปัจจุบัน):
```json
{ "tier_name": "ครบวงจร 4 — 50 ท่าน", "total_pax": 50, "monk_pax": 9, "price": 28000, "image_url": "..." }
```

เป็น (ใหม่ — เพิ่ม `quality_levels` ถ้ามีหลายระดับ):
```json
{
  "tier_name": "50 ท่าน",
  "total_pax": 50,
  "monk_pax": 9,
  "price": 28000,              // ราคาเริ่มต้น (เหมือนเดิม สำหรับ tier ที่ไม่มีหลายระดับ)
  "image_url": "...",
  "quality_levels": [          // ใหม่ (optional)
    { "name": "Standard", "price": 30000, "image_url": "...", "highlights": "เมนูครบถ้วน วัตถุดิบสดใหม่" },
    { "name": "Premium",  "price": 32500, "image_url": "...", "highlights": "เนื้อปู หูฉลาม ปลากะพง" },
    { "name": "Elite",    "price": 35000, "image_url": "...", "highlights": "ปลาเก๋า เป็ดย่าง รังนก" }
  ]
}
```

Tier ที่ไม่มีระดับคุณภาพ ก็ไม่ใส่ `quality_levels` (ทำงานเหมือนเดิม 100% — backward compatible)

---

## สิ่งที่ต้องทำ

### 1. UI: `src/pages/Packages.tsx` (Tier editor)
เพิ่มปุ่ม **"+ เพิ่มระดับคุณภาพ"** ใต้แต่ละ tier เปิด sub-form:
- ชื่อระดับ (Standard / Premium / Elite — free text)
- ราคา
- รูป (upload เดียว)
- จุดเด่น (textarea สั้น)
- ลบได้ ลากเรียงได้

### 2. Webhook: `supabase/functions/line-webhook/index.ts`
**ส่วน pkgContext (บรรทัด ~447-457):** เมื่อ tier มี `quality_levels` ให้ render เป็น:
```
- [50 ท่าน] 50 ท่าน (พระ 9 + แขก 41) 【รับแขกได้สูงสุด 41 คน】
    • Standard: 30,000 — เมนูครบถ้วน 🖼️
    • Premium: 32,500 — เนื้อปู หูฉลาม 🖼️
    • Elite: 35,000 — ปลาเก๋า เป็ดย่าง 🖼️
```

**ส่วน tierImageRefs (บรรทัด ~485-490):** เพิ่ม loop สำหรับ quality_levels:
- title format: `แพ็กเกจ: <name> — <tier_name> — <quality_name>`
- AI ใช้ title นี้ใน `image_titles` เพื่อสั่งส่งรูประดับนั้น ๆ

### 3. Strict rule ใหม่ (แทน rule ที่เกี่ยวกับ KB เปรียบเทียบ)
"เมื่อ tier ที่ capacity พอ มี `quality_levels` หลายระดับ → เสนอครบทุกระดับพร้อมจุดต่าง+ราคา ห้ามเลือกให้ลูกค้าเอง ห้ามใช้ราคาจากที่อื่นนอกจาก pricing_tiers"

### 4. Migration ข้อมูลเก่า
- KB *"เปรียบเทียบโต๊ะจีน 40 ท่าน"* → ย้ายเข้า quality_levels ของ tier 50 ท่าน (หรือ tier ที่ถูกต้อง) แล้วลบ KB ทิ้ง
- ผมจะแสดงรายการ KB เปรียบเทียบทั้งหมดให้ดู ก่อนลบ

### 5. Types
อัปเดต `src/integrations/supabase/types.ts` (auto) + interface `PricingTier` ใน Packages.tsx

---

## ผลลัพธ์ที่จะเห็น
ลูกค้า "แขก 40" → AI:
1. คำนวณ guest=40 → หา tier ที่ guest_pax ≥ 40 → ได้ tier 50 ท่าน
2. tier 50 มี quality_levels 3 ระดับ → เสนอครบ 3 ระดับ พร้อมราคาที่ถูกต้อง 28,000/30,000/etc
3. ส่งรูปทั้ง 3 ระดับให้เลือก

ไม่ต้องพึ่ง KB เปรียบเทียบเลย