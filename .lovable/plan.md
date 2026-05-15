## เป้าหมาย
ทำให้ `ai_active` เป็น **single source of truth** สำหรับการเปิด/ปิด AI — เมื่อ admin กด "ปลุกบอท" แล้ว AI ต้องตอบได้จริง โดยไม่ต้องไปยุ่งกับ `status` ของลูกค้า

## ปัญหาปัจจุบัน
`line-webhook/index.ts` มี safety gate ที่เช็คทั้ง `ai_active` **และ** `status in AI_OFF_STATUSES`  
→ พอลูกค้าให้เบอร์ ระบบตั้ง `status='pending_quote'` + `ai_active=false`  
→ admin กดปลุกบอท เปลี่ยนแค่ `ai_active=true` แต่ `status` ยังเป็น `pending_quote`  
→ AI ยังถูกบล็อกอยู่

## สิ่งที่จะแก้

**1. `supabase/functions/line-webhook/index.ts`**
- แก้ safety gate: ถ้า `ai_active === true` → ให้ผ่าน ไม่ต้องเช็ค `AI_OFF_STATUSES` อีก
- เงื่อนไขใหม่ (pseudo): `if (!customer.ai_active || (customer.manual_chat_until && new Date(customer.manual_chat_until) > now)) return;`
- ลบ/ข้าม การเช็ค `AI_OFF_STATUSES` ใน gate (status เป็นแค่ป้าย funnel ไม่ใช่ตัวควบคุม AI)

**2. คงพฤติกรรมเดิมของ `StatusSelector.tsx` ไว้**
- เลือก status ที่อยู่ใน `AI_OFF_STATUSES` → auto set `ai_active=false` (ทางลัดให้ staff ปิดบอทพร้อมเปลี่ยน status ในคลิกเดียว)
- ไม่ต้องแก้ไฟล์นี้

**3. คงพฤติกรรมเดิมของ `ManualTimerBanner.tsx` + `Chats.toggleAi` + `liff-admin-panel` ไว้**
- "ปลุกบอท" ตั้ง `ai_active=true`, `manual_chat_until=null`, `ai_resumed_at=now` ตามเดิม
- ไม่ต้อง reset `status` (ตามที่คุยกัน)

## วงจรหลังแก้

1. ลูกค้าให้เบอร์ → `status='pending_quote'`, `ai_active=false`, `manual_chat_until=+1h` (เหมือนเดิม)
2. Admin กด "ปลุกบอท" → `ai_active=true` → **AI ตอบได้ทันที** (status คง `pending_quote` เพื่อ track funnel)
3. อยากปิดบอทอีก:
   - กดปุ่ม "ปิด AI" / toggle ในหน้า Chats → `ai_active=false`
   - หรือเลือก status ใหม่ใน StatusSelector (pending_quote/pending_confirm/confirmed) → auto `ai_active=false`

## ไฟล์ที่แก้
- `supabase/functions/line-webhook/index.ts` (gate logic เท่านั้น ~3 บรรทัด)

## ทดสอบหลัง deploy
- ส่งข้อความ → ลูกค้าให้เบอร์ → ยืนยันว่า AI หยุด
- กดปลุกบอทในหน้า /chats → ส่งข้อความใหม่ → ยืนยันว่า AI ตอบ
- เช็ค edge logs ไม่มี early return จาก gate
