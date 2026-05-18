# แผนปรับ AI ให้ประหยัด Token

## เป้าหมาย
ลดต้นทุน token ของ LINE bot โดยไม่ลดคุณภาพคำตอบ

---

## 1. KB Summary Cache (Auto + Manual rebuild)

**สิ่งที่ทำ:**
- เพิ่มตาราง `ai_context_cache` (key, content, token_count, updated_at)
- เก็บ "prompt-ready text" 3 ก้อน: `kb_summary`, `packages_summary`, `promotions_summary`
- Auto rebuild ด้วย Postgres trigger เมื่อมีการ INSERT/UPDATE/DELETE บน `knowledge_base`, `catering_packages`, `promotions`
- Trigger เรียก edge function `rebuild-ai-cache` (async, ผ่าน pg_net) เพื่อ generate text ใหม่
- ปุ่ม **"Rebuild AI Cache"** ในหน้า Settings → เรียก edge function ตรงๆ
- `line-webhook` อ่านจาก cache แทนการ query+build ทุกครั้ง

**ประโยชน์:** ลด DB query + ลดเวลาประกอบ prompt + รู้ token count ล่วงหน้า

---

## 2. Token-based Truncation

**สิ่งที่ทำ:**
- เพิ่ม helper `countTokens(text)` ใน edge function ใช้ `gpt-tokenizer` (npm) หรือ approximate
- กำหนด budget เป็น token แทน chars:
  - KB context: max 3,000 tokens (เดิม 800 chars/entry)
  - Package context: max 2,000 tokens
  - Promo context: max 800 tokens
  - History: max 2,000 tokens
  - **Total prompt budget: ~10,000 tokens**
- ถ้าเกิน → ตัดท้ายทีละ entry จนพอดี

**ประโยชน์:** คุมต้นทุนแม่นยำ (ภาษาไทย char ≠ token), ไม่เสี่ยงเกิน context window

---

## 3. Conversation Summary (เกิน 20 ข้อความ)

**สิ่งที่ทำ:**
- เพิ่ม column `conversation_summary` (text) + `summary_until_message_id` ใน `customers`
- เมื่อข้อความใน conversation > 20:
  - เรียก `gemini-2.5-flash-lite` สรุปข้อความ 1 ถึง N-10 → เก็บใน `conversation_summary`
  - ส่งเข้า prompt เป็น "📋 สรุปบทสนทนาก่อนหน้า: ..." + 10 ข้อความล่าสุด
- Update summary ทุกครั้งที่เกิน threshold อีกครั้ง

**ประโยชน์:** ลูกค้าคุยยาวๆ AI ยังจำได้โดยไม่ส่ง history ยาวเต็มทุกครั้ง

---

## 4. Hybrid Relevant Filter (ประหยัด + ปลอดภัย)

**สิ่งที่ทำ:**
ใน `line-webhook` ก่อนประกอบ prompt:
- ถ้า `customer.event_type` มีค่า (เช่น "งานบุญ", "ขึ้นบ้านใหม่"):
  - กรอง `packages` เหลือเฉพาะที่ `category` match กับ event_type
  - กรอง `promotions` เหลือเฉพาะที่ `applicable_categories` มี event_type นั้น หรือ empty (ใช้ได้ทุกงาน)
- ถ้าไม่มี event_type → ส่งทั้งหมดเหมือนเดิม (ไม่พลาดข้อมูล)

**ประโยชน์:** ประหยัด token 30-60% ในเคสที่ classify intent แล้ว, ไม่เพิ่ม AI call, ไม่เสี่ยงตอบผิด

---

## ส่วนที่แก้

```text
DB migration:
  - ตาราง ai_context_cache (key text PK, content text, token_count int, updated_at)
  - columns ใน customers: conversation_summary, summary_until_message_id
  - triggers บน knowledge_base/catering_packages/promotions เรียก pg_net → rebuild-ai-cache

Edge functions:
  - NEW: rebuild-ai-cache  (build 3 summary blocks, นับ token, upsert cache)
  - NEW: summarize-conversation (สรุป history เก่า → customers.conversation_summary)
  - UPDATE: line-webhook
      * อ่าน cache แทน build จาก scratch
      * token-based truncation
      * hybrid filter ตาม event_type
      * ใช้ conversation_summary ถ้ามี

Frontend:
  - Settings.tsx: ปุ่ม "Rebuild AI Cache" + แสดง token count ของแต่ละ block + updated_at
```

## ผลที่คาดหวัง
- Token/request ลดลง **~40-60%** สำหรับลูกค้าที่ classify แล้ว
- Latency ลดลง (ไม่ต้อง build context ทุกครั้ง)
- คุมต้นทุนได้แม่นยำ มี dashboard เห็น token usage

---

ยืนยันแผนนี้แล้วจะเริ่มทำ migration ก่อนนะคะ
