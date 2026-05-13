## ปัญหา
ปัจจุบันรูปผูกกับ "แพ็กเกจ" (package-level) — AI ส่งรูปทั้งหมดของแพ็กนั้น ไม่สามารถเลือกรูปตามจำนวนคน/เกรด (Standard/Premium/Elite) ที่ลูกค้าถามได้

## เป้าหมาย
ตอบสั้น + แนบรูป **เฉพาะ tier ที่ตรงคำถาม** เช่น
- ลูกค้า: "งานบุญ 20 ท่าน" → ตอบราคา + แนบรูป "ครบวงจร 1 — 20 ท่าน"
- ลูกค้า: "โต๊ะจีน 40 ท่าน" → ตอบราคา 3 แพ็ก + แนบรูป "40 ท่าน รวมพระ 3 แพ็ก"

## โครงสร้างที่แนะนำ — รูปสองชั้น

### ชั้น 1: Package-level `image_urls` (ที่มีอยู่แล้ว)
ใช้กับ **รูปภาพรวม/เปรียบเทียบ** ที่ครอบคลุมทั้งแพ็ก เช่น "40 ท่าน รวมพระ — Standard/Premium/Elite" (รูปที่ 2 ที่อัปโหลด)

### ชั้น 2: Tier-level `image_url` (ใหม่)
เพิ่ม field `image_url` (string) ใน `pricing_tiers[i]` jsonb — 1 รูปต่อ tier
ใช้กับ **รูปเฉพาะระดับ** เช่น "ครบวงจร 1 — 20 ท่าน 22,000 ฿" (รูปที่ 1 ที่อัปโหลด)

ไม่ต้อง migrate schema — `pricing_tiers` เป็น jsonb อยู่แล้ว

## ตัวอย่างโครงข้อมูล

```jsonc
// แพ็ก "งานบุญครบวงจร" (บุญ+บุฟเฟ่ต์)
{
  "image_urls": [],   // ไม่มีรูปรวม
  "pricing_tiers": [
    { "tier_name": "ครบวงจร 1 — 20 ท่าน", "total_pax": 20, "price": 22000,
      "image_url": "https://.../ครบวงจร_20.jpg" },
    { "tier_name": "ครบวงจร 2 — 30 ท่าน", "total_pax": 30, "price": 24000,
      "image_url": "https://.../ครบวงจร_30.jpg" },
    // ...
  ]
}

// แพ็ก "โต๊ะจีน 1/2/3" (บุญ+โต๊ะจีน)
{
  "image_urls": ["https://.../40ท่าน_เปรียบเทียบ_3แพ็ก.jpg"],  // รูปรวม
  "pricing_tiers": [
    { "tier_name": "40 ท่าน", "price": 30000, "image_url": null }
    // tier ไม่ต้องมีรูปแยก — ใช้รูปรวมพอ
  ]
}
```

## งานที่ต้องทำ

### 1. UI: เพิ่มช่อง "รูปประจำ tier" (`src/pages/Knowledge.tsx`)
- ใน tier editor (รอบๆ บรรทัด 145-149) เพิ่มปุ่มอัปโหลด/ใส่ URL **1 รูปต่อ tier**
- ใช้ component `ImageUrlsField` ที่มีอยู่ (จำกัด 1 รูป) หรือสร้าง mini variant

### 2. Edge function (`supabase/functions/line-webhook/index.ts`)
**a. แสดง tier images ใน prompt context** (รอบบรรทัด 351-360)
```ts
p.pricing_tiers.forEach((t) => {
  // ... existing
  if (t.image_url) s += ` 🖼️[รูป: ${p.name} — ${t.tier_name}]`;
});
```

**b. ขยาย `allImageSources`** ให้รวม tier-level (รอบบรรทัด 381-386)
```ts
const tierImageRefs = (pkgs || []).flatMap((p) =>
  (p.pricing_tiers || []).filter((t) => t.image_url)
    .map((t) => `"แพ็กเกจ: ${p.name} — ${t.tier_name}"`)
);
```

**c. Resolve รูปจาก image_titles** (รอบบรรทัด 528-532)
- เพิ่มกรณี match `แพ็กเกจ: <name> — <tier_name>` → ดึง `tier.image_url`

**d. กฎใน system prompt**:
> ถ้าลูกค้าถามจำนวนคน/ระดับเฉพาะ → ใส่ `image_titles: ["แพ็กเกจ: X — tier Y"]` (ไม่ใช่แค่ชื่อแพ็ก)
> ถ้าลูกค้าขอเปรียบเทียบหลายระดับ → ใช้รูปแพ็ก (`"แพ็กเกจ: X"`) ที่เป็นรูปรวม

### 3. ไม่แตะ schema, ไม่แตะ types

## คำตอบสั้นๆ ต่อคำถาม
- **AI จะรู้ไหม?** — ถ้าใส่รูปแบบ flat package-level อย่างเดียว AI จะส่งทุกรูปของแพ็กนั้นไปพร้อมกัน (เยอะเกิน) → ควรแยกตาม tier
- **ฐานควรแยกยังไง?** — รูปต่อ tier ใน `pricing_tiers[i].image_url` + รูปรวม/เปรียบเทียบใน `image_urls` ของแพ็ก
- **ข้อดี**: AI เลือก tier อยู่แล้ว → แนบรูปตรง tier นั้นอัตโนมัติ ลูกค้าได้รูปที่แชร์ต่อได้เลย
