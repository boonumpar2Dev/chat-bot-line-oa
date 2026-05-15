## ปัญหา
ตอนนี้ AI เสนอโปรได้โดยไม่เช็คจำนวนแขก ทำให้บางทีเสนอโปรที่ลูกค้าใช้ไม่ได้ และไม่ได้บอกชื่อโปร/เงื่อนไขให้ครบ

## เป้าหมาย
- โปรโมชั่นมีฟิลด์ `min_guests` (จำนวนท่านขั้นต่ำที่ใช้โปรได้)
- AI ต้องเช็ค `min_guests` กับจำนวนแขกที่ลูกค้าให้มา ก่อนตัดสินใจเสนอ
- ถ้าลูกค้ายังไม่บอกจำนวน → ให้บอกเงื่อนไขควบคู่ไปด้วย ("โปร X สำหรับงาน 50 ท่านขึ้นไป")
- ถ้าลูกค้าจำนวนน้อยกว่า → ห้ามเสนอ (หรือบอกตรงๆ ว่ายังไม่ถึงเกณฑ์)
- ตอบลูกค้าต้อง **บอกชื่อโปรเสมอ** ห้ามพูดลอยๆ ว่า "มีโปรนะคะ"

## แผนงาน

### 1. Migration — เพิ่ม column
```sql
ALTER TABLE public.promotions 
ADD COLUMN min_guests integer;
```
- nullable, ไม่มี default → `null` = ไม่มีเงื่อนไขจำนวนท่าน (ใช้กับงานทุกขนาด)

### 2. UI — `src/pages/Knowledge.tsx` (PromotionsTab)
- อัปเดต `type Promo` เพิ่ม `min_guests: number | null`
- `blankPromo` ใส่ `min_guests: null`
- ใน Dialog เพิ่มช่อง "จำนวนท่านขั้นต่ำ (ถ้ามี)" — Input type=number, ว่าง = ไม่จำกัด
- ใน Card แสดง badge "ขั้นต่ำ N ท่าน" ถ้ามีค่า

### 3. Edge Functions — `kb-chat-test` + `line-webhook`
ใน promoContext ของทั้ง 2 ไฟล์:
- เพิ่มบรรทัด `เงื่อนไข: ใช้กับงานตั้งแต่ ${min_guests} ท่านขึ้นไป` ถ้ามีค่า
- เพิ่มข้อความใน prompt section หลัง promoContext:
  ```
  ⚠️ กฎเสนอโปรโมชั่น:
  1. ก่อนเสนอโปร เช็คจำนวนแขกของลูกค้า เทียบกับเงื่อนไขขั้นต่ำของโปรนั้นเสมอ
  2. ถ้าลูกค้ายังไม่บอกจำนวน → เสนอได้แต่ต้องบอกเงื่อนไขควบคู่
  3. ถ้าลูกค้าจำนวนน้อยกว่าเงื่อนไข → ห้ามเสนอโปรนั้น (เสนอตัวอื่นที่เข้าเกณฑ์ หรือไม่เสนอเลย)
  4. เสนอโปรต้องบอกชื่อโปรเต็มเสมอ ห้ามพูดลอยๆ ว่า "มีโปร"
  ```

## ไฟล์ที่แก้
1. Migration ใหม่ — `promotions.min_guests`
2. `src/pages/Knowledge.tsx` — Promo type + dialog field + card badge
3. `supabase/functions/kb-chat-test/index.ts` — promoContext + prompt rules
4. `supabase/functions/line-webhook/index.ts` — promoContext + prompt rules

## หมายเหตุ
- ไม่แตะ `applicable_categories` (logic เดิมยังใช้ได้)
- AI จะอ่านค่าจาก `knownFacts.จำนวนแขก` ที่มีอยู่แล้ว (จาก regex `\d+\s*(ท่าน|คน|ที่)`)
