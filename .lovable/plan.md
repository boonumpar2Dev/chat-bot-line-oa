## ปัญหา
หน้าทดสอบ AI (`kb-chat-test`) ยังไม่รองรับรูปประจำ tier — มีแต่ `line-webhook` ที่อัปเดตไปแล้ว ทำให้ AI ในแชททดสอบไม่เห็น/ส่งรูป tier (เช่น "ครบวงจร 1 — 20 ท่าน") แม้ฐานข้อมูลจะมี `pricing_tiers[i].image_url` อยู่

## สิ่งที่จะแก้ (ไฟล์เดียว: `supabase/functions/kb-chat-test/index.ts`)

1. **Prompt context (รอบสร้าง pkgContext)** — ใส่ flag `🖼️` ต่อท้าย tier ที่มี `image_url` เพื่อให้ AI รู้ว่ามีรูปแยก
2. **imageSources** — เพิ่ม `"แพ็กเกจ: <name> — <tier_name>"` สำหรับทุก tier ที่มี `image_url`
3. **System prompt rule** — เพิ่มกฎเลือกรูป: ลูกค้าถามเจาะจง tier ใด → ใช้ชื่อ tier ใน `image_titles` แทนชื่อแพ็กเกจรวม
4. **Lookup ตอน resolve image_titles → URLs** — เติม mapping `"แพ็กเกจ: <name> — <tier_name>"` → `[tier.image_url]`

ไม่แตะ schema, ไม่แตะ UI, ไม่แตะ `line-webhook`
