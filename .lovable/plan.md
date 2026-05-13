## ปัญหา
ลูกค้าส่งเลขจาก FB lead เช่น `tag 1111111112543` (เลขประจำตัวผู้เสียภาษี/Tax ID 13 หลัก) แต่ระบบเอาไปเช็คเป็น "เบอร์โทร" → ตอบ "ไม่ขึ้นต้นด้วย 0..." ผิดบริบท

## เป้าหมาย
- ตรวจจับ Tax ID (13 หลัก) แยกจากเบอร์โทร
- เก็บลง DB เป็นข้อมูลลูกค้า ไม่ปนกับ phone
- ตอบรับสั้นๆ ไม่ตื๊อขอเบอร์ซ้ำ (ลูกค้าให้ tag มาแล้ว = มาจาก FB lead → มีช่องทางติดต่อกลับอยู่แล้ว)

## แผนงาน

### 1. DB — เพิ่ม column `tax_id` ใน `customers`
```
ALTER TABLE customers ADD COLUMN tax_id text;
```

### 2. แก้ `supabase/functions/line-webhook/index.ts`
ก่อน block phone detection (บรรทัด ~239) เพิ่ม Tax ID detection:

**กฎ:**
- เก็บเลขล้วนทุกชุดในข้อความ (regex `\d{10,15}`)
- ถ้าเจอเลข **13 หลักพอดี** → ถือเป็น Tax ID (เลขมือถือไทย = 10 หลัก, เบอร์บ้าน = 9 หลัก, ไม่มีเบอร์ไทย 13 หลัก)
- หรือเจอ keyword `tag`, `แท็ก`, `tax`, `ภาษี`, `เลขผู้เสียภาษี`, `นิติบุคคล` ในข้อความ + เลข 10-13 หลัก → Tax ID
- ถ้าเป็น Tax ID:
  - `UPDATE customers SET tax_id=..., status='pending_quote', ai_active=false, manual_chat_until=now()+phone_mute_hours`
  - ตอบ: "รับทราบค่ะ ได้รับข้อมูล tag/เลขผู้เสียภาษี `xxx` เรียบร้อย เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏"
  - return (ไม่เข้า phone validation)
- ถ้าไม่ใช่ Tax ID → ทำ phone detection ตามเดิม **แต่กรอง 13 หลักออกจาก candidates** (ปัจจุบันรับ 7-15 หลักจึงพลาด)

### 3. แก้ `supabase/functions/kb-chat-test/index.ts`
ใส่ logic เดียวกัน (เพื่อให้ทดสอบได้ตรงกัน) — แค่ตอบ ไม่ต้อง update DB

### 4. UI — แสดง `tax_id` (optional)
- `Chats.tsx` panel ลูกค้า: เพิ่มบรรทัด "เลขผู้เสียภาษี: xxx" ถ้ามี
- (ไม่ต้องแก้ Settings — ไม่ต้องตั้งค่าอะไรเพิ่ม)

## ไฟล์ที่แก้
1. migration: เพิ่ม `customers.tax_id`
2. `supabase/functions/line-webhook/index.ts` — เพิ่ม Tax ID block + กรอง 13 หลักออกจาก phone
3. `supabase/functions/kb-chat-test/index.ts` — เพิ่ม Tax ID block
4. `src/pages/Chats.tsx` — แสดง tax_id (ถ้ามี panel ข้อมูลลูกค้า)

## หมายเหตุ
ไม่แตะ AI prompt / strict_rules — เป็นเรื่อง parsing ล้วนๆ ก่อนถึง AI ไม่ใช่พฤติกรรม AI
