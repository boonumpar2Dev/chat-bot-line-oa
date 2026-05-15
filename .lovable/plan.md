## เป้าหมาย
เมื่อลูกค้าส่งรูป (โดยเฉพาะแคปแชทจากที่อื่น เช่น แคปจาก Messenger/Line อื่น/ใบเสนอราคาคู่แข่ง) ให้ AI **อ่านข้อความในรูปด้วย OCR/Vision** แล้วใช้เป็น context ตอบต่อได้เหมือนลูกค้าพิมพ์เอง — ไม่ใช่แค่บันทึกว่า "[รูปภาพ]"

## ขอบเขต
แก้เฉพาะ `supabase/functions/line-webhook/index.ts` (ฝั่งรับข้อความ LINE)
ไม่แตะ UI / ไม่แตะ schema

## วิธีทำ

### 1. เพิ่มฟังก์ชัน `ocrImage(url)` 
- เรียก Lovable AI Gateway ด้วย model `google/gemini-2.5-flash` (รองรับ vision + เร็ว + ถูก)
- ส่ง `image_url` ของรูปที่อัปโหลดเข้า Supabase Storage แล้ว
- prompt: "อ่านข้อความทั้งหมดในรูปนี้ ถ้าเป็นแคปแชท ให้แยก 'ผู้พูด: ข้อความ' ตามลำดับ ถ้าเป็นใบเสนอราคา/เมนู ให้สรุปรายการ+ราคา ถ้าไม่มีข้อความให้บรรยายสั้นๆ ว่ารูปคืออะไร"
- ตอบเป็น plain text สั้นๆ (ไม่เกิน ~500 ตัวอักษร)
- timeout/error → return null (ไม่ block flow)

### 2. แก้ block `msgType === "image"` (บรรทัด ~156-159)
เดิม:
```
messageText = `[รูปภาพ]\n📎 ${fileUrl}`
```
ใหม่:
```
const ocr = await ocrImage(fileUrl)
messageText = ocr 
  ? `[รูปภาพ]\n📎 ${fileUrl}\n📄 เนื้อหาในรูป:\n${ocr}` 
  : `[รูปภาพ]\n📎 ${fileUrl}`
```
ผลลัพธ์: ทั้งหน้าแชทแอดมินเห็น OCR และ AI prompt ได้ context นี้ไปด้วยอัตโนมัติ (เพราะ history ใช้ messageText)

### 3. ปรับ snippet ใน `last_message_snippet`
ถ้ามี OCR → ใช้บรรทัดแรกของ OCR เป็น snippet แทน "[รูปภาพ]" เพื่อให้ list แชทอ่านง่าย

### 4. Prompt AI: เพิ่มกฎ
ใน system prompt เพิ่ม 1 บรรทัด:
> "ถ้า message ลูกค้ามี '📄 เนื้อหาในรูป:' = ลูกค้าส่งแคปแชท/รูปเอกสารมา ให้อ่านเนื้อหานั้นเหมือนลูกค้าพิมพ์เอง และตอบต่อบทสนทนาในรูปได้"

## ที่ไม่ทำ (เก็บไว้ทีหลังถ้าต้องการ)
- ไม่ทำ OCR กับ video/file/sticker
- ไม่เก็บ OCR result เป็น column แยกใน DB (อยู่ในตัว message พอ)
- ไม่ทำ retry/queue — ถ้า OCR ล้มก็ปล่อยผ่าน

## Technical
- Model: `google/gemini-2.5-flash` (vision support, ใช้ LOVABLE_API_KEY เดิม)
- เพิ่ม latency ~1-2s ต่อรูป — รับได้เพราะ debounce 8s อยู่แล้ว
- ถ้ารูปหลายใบใน 1 batch (debounce รวม) → OCR ทุกใบขนานกันด้วย Promise.all