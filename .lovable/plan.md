## ปัญหา
AI ตอบกลับเป็น JSON ห่อด้วย markdown code fence (` ```json ... ``` `) — `JSON.parse()` ใน `callAI` แตก เลย fallback เอาข้อความดิบทั้งก้อน (รวม fence + key) ใส่ฟิลด์ `answer` ไปแสดงในแชท

## แก้ที่ไฟล์เดียว: `supabase/functions/kb-chat-test/index.ts`

ปรับฟังก์ชัน `callAI` ให้:

1. **ตัด markdown fence ก่อน parse** — ลบ ` ```json ` / ` ``` ` ที่ห่ออยู่ทั้งหน้า/หลัง
2. **ถ้ายัง parse ไม่ได้ ให้ดึงเฉพาะ JSON object ก้อนแรก** ด้วย regex `/\{[\s\S]*\}/`
3. **ถ้ายังพังอีก** fallback เดิม (ใช้ txt เป็น answer) แต่ log warning ให้เห็นใน edge function logs

ผลที่ได้: ลูกค้าจะเห็นเฉพาะข้อความใน `answer` ไม่เห็น JSON ดิบอีก ส่วน `image_titles` ก็ทำงานถูกต้อง รูปแนบไปด้วย

ไม่แตะ prompt, schema, หรือ UI