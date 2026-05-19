## ปัญหาที่พบ

ตอนนี้มี **2 ที่ที่สร้าง prompt ให้ AI** แต่ไม่ได้อ่านจาก Settings เหมือนกัน:

| ที่ | อ่านจาก Settings? |
|---|---|
| `line-webhook` (LINE จริง) | ✅ อ่าน `ai_persona`, `strict_rules`, `image_selection_rules`, `tier_special_rules`, `forbidden_terms`, `allowed_service_types`, `intent_collection_order` |
| `kb-chat-test` (หน้าทดสอบ/Chats) | ❌ **hardcode กฎทองทั้งหมดในโค้ด** อ่านแค่ `strict_rules` ผ่านๆ |

แปลว่า:
1. แก้กฎใน Settings → เฉพาะ LINE จริงเห็น หน้าทดสอบไม่เห็น → ทดสอบไม่ตรงกับของจริง
2. เราเพิ่งเพิ่ม "กฎชิมอาหาร" เข้า `strict_rules` ใน Settings → kb-chat-test มองข้าม กฎทองที่ hardcode ทับ
3. เลย hardcode `tasteGuard` เป็นแพตช์ 2 ไฟล์ — ผิดทาง เพราะกฎอยู่ใน Settings แล้ว ไม่ควรต้องแก้โค้ดอีก

## เป้าหมาย

ทำให้ **Settings = ความจริงเดียว (single source of truth)** ทุก prompt ทั้ง LINE จริงและหน้าทดสอบสร้างจาก Settings ตัวเดียวกัน 100% — แก้ Settings แล้วเห็นผลทั้งสองที่ทันทีไม่ต้องแก้โค้ด

## แผนปรับ

### 1. สร้าง `_shared/prompt-builder.ts`
ย้าย logic ประกอบ prompt (persona + strict_rules + image rules + tier rules + KB + history) มาไว้ที่เดียว รับ input เป็น `{ cfg, kb, pkgs, promos, customer, history, message }` คืน prompt string

### 2. `line-webhook` และ `kb-chat-test` เรียกใช้ `prompt-builder` ตัวเดียวกัน
ลบกฎทอง/ANTI-HALLUCINATION/ตรวจ 6 ข้อ ที่ hardcode ใน kb-chat-test ออกทั้งหมด ให้อ่านจาก Settings เท่านั้น

### 3. ลบ `tasteGuard` hardcode ออกจากทั้ง 2 ไฟล์
เพราะกฎชิมอาหารอยู่ใน `strict_rules` แล้ว (เคยใส่รอบก่อน) — ถ้า strict_rules ถูกวางในตำแหน่งสูง ก็ไม่ต้อง guard เพิ่ม

### 4. ย้าย `strictRulesSection` ขึ้น top ของ prompt
วางก่อน "กฎหลัก" และก่อน KB เพื่อให้ AI ให้น้ำหนักสูงสุด (ตอนนี้อยู่ท้าย ⇒ น้ำหนักต่ำ)

### 5. เพิ่มกฎทองที่ยัง hardcode อยู่ → ย้ายเป็น default `strict_rules`
ตัวอย่างกฎที่ kb-chat-test hardcode แต่ควรเป็น strict_rules (แก้ได้จาก UI):
- ห้าม "ยินดีด้วยค่ะ"
- ใช้ "ค่ะ/คะ" เท่านั้น ห้ามสลับ "ครับ"
- ห้ามถามซ้ำข้อมูลที่ลูกค้าให้แล้ว
- กรณีจำนวนแขกเศษ เสนอทางเดียวต่อรอบ

จะ migrate เข้า `app_settings.strict_rules` ตอน deploy (insert ถ้ายังไม่มี)

### 6. Verify
- ส่งข้อความ "ชิมอาหารฟรีได้ไหมคะ" ใน Chats (หน้าทดสอบ) → ต้องตอบกฎเดียวกับ LINE จริง
- แก้ strict_rules ใน Settings → ทั้ง 2 ที่ต้องเปลี่ยนพร้อมกัน

## รายละเอียดทางเทคนิค

- ไฟล์ใหม่: `supabase/functions/_shared/prompt-builder.ts` export `buildPrompt(input): string`
- `line-webhook/index.ts` ราว line 520-680 → แทนด้วย `buildPrompt({...})`
- `kb-chat-test/index.ts` ราว line 225-325 → แทนด้วย `buildPrompt({...})` แบบเดียวกัน (history map ให้ตรง format)
- ลบ `tasteGuard`, `tasteGuardKC`, post-check ที่ override คำตอบ
- Deploy ทั้ง `line-webhook` + `kb-chat-test`

ผลลัพธ์: หลังจากนี้ **ทุกการเปลี่ยน prompt = แก้ที่ Settings UI อย่างเดียว** ไม่ต้องแตะโค้ดอีก