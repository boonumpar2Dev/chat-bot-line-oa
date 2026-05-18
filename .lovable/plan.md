## เป้าหมาย
ทำให้กลยุทธ์ "ส่งรูปเปรียบเทียบก่อน แล้วค่อยส่งรายละเอียด tier" เป็น **setting ที่ตั้งค่าได้ใน UI** ไม่ฝังในข้อความ strict_rules เพื่อให้ reuse กับธุรกิจอื่นได้

## สิ่งที่จะทำ

### 1. Schema เพิ่ม 2 fields ใน `app_settings`
- `comparison_phase_enabled` (boolean, default false) — เปิด/ปิดกลยุทธ์
- `comparison_kb_category` (text, nullable) — ชื่อหมวด KB ที่จะใช้เป็นแหล่งรูปเปรียบเทียบ

### 2. Settings UI (`src/pages/Settings.tsx` หรือไฟล์ที่เกี่ยว)
เพิ่ม section ใหม่ "กลยุทธ์ส่งรูปเปรียบเทียบ":
- Toggle เปิด/ปิด
- Dropdown เลือกหมวด KB (load จาก `knowledge_categories`)
- คำอธิบายสั้นๆ ว่ากลยุทธ์นี้ทำอะไร

### 3. แก้ `line-webhook/index.ts`
- อ่าน `comparison_phase_enabled` + `comparison_kb_category` จาก cfg
- ถ้าเปิด → ฉีดกฎ 2-phase เข้า prompt แบบ dynamic โดยอ้างชื่อหมวดที่ตั้งไว้ (เช่น `เมื่อลูกค้ายังไม่ระบุ tier/งบ → ใส่ image_titles จาก KB หมวด "${comparison_kb_category}" ที่ตรงจำนวนคน...`)
- ถ้าปิด → ไม่ฉีด, AI ทำงานแบบเดิม

### 4. ลบกฎ 3 ข้อที่เพิ่งใส่ใน `strict_rules`
เพื่อไม่ให้ซ้ำกับ logic ใหม่

## ข้อดี
- เปิด/ปิดได้จาก UI ไม่ต้องแก้โค้ด
- ธุรกิจอื่นใช้ชื่อหมวดของตัวเองได้
- strict_rules กลับมาสะอาด ไม่ผูกกับฟีเจอร์เฉพาะ

## ไฟล์ที่แก้
- migration: เพิ่ม 2 columns ใน `app_settings` + cleanup strict_rules
- `src/pages/Settings.tsx` (หรือไฟล์ที่ render setting form)
- `supabase/functions/line-webhook/index.ts`
