## เพิ่มปุ่ม "คัดลอกจากแพ็กเกจเดิม"

เพิ่มฟีเจอร์ duplicate ใน Knowledge page (แท็บแพ็กเกจ) เพื่อให้สร้างแพ็กใหม่จากของเดิมได้เร็วขึ้น

### สิ่งที่จะทำ

1. **ปุ่ม "คัดลอก" บนการ์ดแต่ละแพ็ก** (ไอคอน Copy ข้างปุ่มแก้ไข/ลบ)
   - กดแล้วเปิด dialog แก้ไขทันที โดย prefill ทุก field จากแพ็กต้นทาง
   - ตั้งชื่อเริ่มต้นเป็น `{ชื่อเดิม} (สำเนา)`
   - ล้าง `id` ออกเพื่อบันทึกเป็นแพ็กใหม่
   - คัดลอกครบ: description, category, pricing_tiers (รวม quality_levels), image_urls, video_urls, custom_attributes, ai_instruction, min_condition, notes

2. **ขยายไปยังที่อื่นด้วย** (ใช้รูปแบบเดียวกัน)
   - Knowledge Base entries → ปุ่มคัดลอก
   - Promotions → ปุ่มคัดลอก

### รายละเอียดเทคนิค

- แก้เฉพาะ `src/pages/Knowledge.tsx` (frontend อย่างเดียว ไม่แตะ backend/edge functions)
- ใช้ state เดิมที่เปิด dialog แก้ไขอยู่แล้ว เพียงแต่ set `editingItem = null` พร้อม prefill form values จากต้นทาง
- รูป/วิดีโอ: คัดลอก URL เดิมไปเลย (ไม่ต้อง re-upload)

### คำถาม

อยากให้ปุ่ม "คัดลอก" ทำแบบไหน:
- **(A)** เปิด dialog แก้ไข prefill ค่าทั้งหมด แล้วผู้ใช้กดบันทึกเอง (แนะนำ — ได้ตรวจก่อน)
- **(B)** บันทึกเป็นแพ็กใหม่ทันทีเลย แล้วค่อยกดแก้ทีหลัง

ถ้าไม่ระบุจะใช้ (A)
