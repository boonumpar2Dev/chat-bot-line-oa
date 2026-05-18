## ที่เจอใน `line-webhook/index.ts` ที่เป็น Hardcode เฉพาะธุรกิจ "จัดเลี้ยง"

### 🔴 กลุ่ม A — ผูกกับธุรกิจจัดเลี้ยง/สงฆ์ ควรย้ายออก
| # | จุดที่ฝัง | ตอนนี้อยู่ในโค้ด | ปัญหา |
|---|---|---|---|
| A1 | **คำอธิบายบทบาท AI** | `"คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง"` (บรรทัด 551) | ธุรกิจอื่นใช้ไม่ได้ |
| A2 | **รูปแบบอาหารที่อนุญาต** | `"บุฟเฟ่ต์, ซุ้มอาหาร, โต๊ะจีน"` + บัญชีดำ `"ค็อกเทล/คอฟฟี่เบรก/fine dining"` (บรรทัด 561, 602) | เฉพาะร้านอาหารไทย |
| A3 | **กฎเลือกรูป A–F** | บล็อกยาว `🎯 จับเจตนาลูกค้าก่อนเลือกรูป...` (บรรทัด 506) — พูดถึง "พระ", "ซุ้มอาหาร", "เซ็ตเมนูแนะนำสำหรับลูกค้าบุญ", "ตัวอย่างพิธีสงฆ์" | ผูกคำเฉพาะงานบุญ |
| A4 | **กฎจำนวนคน "พระ+แขก"** | บรรทัด 574 (`ถามรวมพระหรือยัง / พระ+แขก`) | เฉพาะงานบุญ |
| A5 | **ลำดับเก็บข้อมูล (intent funnel)** | `ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → เบอร์` (บรรทัด 566) + intent fields (event_type, venue, guest_count, event_date) | ธุรกิจอื่นอาจถามต่างกัน |

### 🟡 กลุ่ม B — กฎสากลแต่ยัง hardcode (ควรย้ายเข้า strict_rules หรือ Settings)
| # | จุด | ที่อยู่ |
|---|---|---|
| B1 | **คำลงท้าย "ค่ะ/นะคะ"** ห้าม "ครับ" | บรรทัด 555, 599 |
| B2 | **ห้ามใช้ "ยินดีด้วยค่ะ"** | บรรทัด 554, 598 |
| B3 | **กฎเศษจำนวน (tier สูงกว่า vs เพิ่มต่อหัว)** | บรรทัด 557, 601 |
| B4 | **กฎ pricing_tiers (ปัดขึ้น / ห้ามเดาเกิน max)** | บรรทัด 576–581 |
| B5 | **กฎโปรโมชั่น 4 ข้อ** | บรรทัด 481–485 (อยู่ใน `promoContext`) |
| B6 | **Trivial words ไม่ตอบ** | `["👍","ok","ขอบคุณ","ค่ะ"...]` บรรทัด 262–266 |
| B7 | **Handover regex** ขอส่งต่อทีมงาน | บรรทัด 757 |
| B8 | **Tax ID keywords** (`tag|แท็ก|tax|ภาษี|นิติบุคคล`) | บรรทัด 285, 289 |

### 🟢 กลุ่ม C — ไม่ควรแตะ (กฎภาษา/format ทั่วไป)
- JSON schema ของ AI response, dedup logic, debounce, phone regex ไทย, ลำดับส่ง LINE batch — เป็น infrastructure ไม่ใช่ business rule

---

## ข้อเสนอ: เพิ่ม Settings ใหม่ 6 ตัว

ใน `app_settings` (และ Settings UI):

1. **`ai_persona`** (text) — แทนบรรทัด A1
   - default: `"คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย เป็นกันเอง ใช้ \"ค่ะ/นะคะ\" ลงท้ายเบาๆ"`
   - UI: textarea ใต้ "การทำงานของ AI"

2. **`allowed_service_types`** (text[]) — แทน A2
   - default: `["บุฟเฟ่ต์","ซุ้มอาหาร","โต๊ะจีน"]`
   - UI: tag input
   - prompt จะ inject: `"รูปแบบบริการ = X, Y, Z เท่านั้น ห้ามแต่งนอกนี้"`

3. **`forbidden_terms`** (text[]) — แทน A2 ส่วน blacklist
   - default: `["ค็อกเทล","คอฟฟี่เบรก","fine dining"]`
   - UI: tag input

4. **`image_selection_rules`** (text) — แทน A3 (บล็อก A–F)
   - default: ข้อความเดิม
   - UI: textarea ใหญ่ ใน card "กลยุทธ์ส่งรูปเปรียบเทียบ" (เพิ่มอีก field)

5. **`intent_fields`** (jsonb) — แทน A5 + ฟิลด์ที่ AI สกัด
   - default: `[{key:"event_type",label:"ประเภทงาน",order:1},{key:"venue",label:"สถานที่",order:2},{key:"guest_count",label:"จำนวนคน",type:"number",order:3},{key:"event_date",label:"วันจัดงาน",type:"date",order:4}]`
   - **หมายเหตุ:** ถ้าจะทำเต็มแบบนี้ ต้องแก้ schema `customers` เป็น dynamic ด้วย — ใหญ่มาก
   - **ทางลัด:** เฟสนี้ขอแค่ `intent_collection_order` (text) — เป็นข้อความบอกลำดับให้ AI เก็บ ไม่แตะ schema

6. **`tier_special_rules`** (text) — แทน A4 (กฎพระ+แขก)
   - default: ข้อความเดิม
   - ถ้าธุรกิจอื่นปิด ส่ง empty string

### กลุ่ม B → ย้ายเข้า `strict_rules` ทั้งหมด
B1–B5, B7 ไม่ต้องสร้าง field ใหม่ — แค่ลบจาก prompt แล้วใส่เป็นกฎ default ใน strict_rules ตอน seed
- ข้อดี: แอดมินแก้ได้จาก UI เดิม
- B6 (trivial words) + B8 (tax keywords): เพิ่มเป็น `trivial_replies` (text[]) และ `tax_id_keywords` (text[])

---

## สรุปไฟล์ที่จะแก้
1. **Migration**: เพิ่ม columns: `ai_persona`, `allowed_service_types`, `forbidden_terms`, `image_selection_rules`, `intent_collection_order`, `tier_special_rules`, `trivial_replies`, `tax_id_keywords` + seed defaults + ย้ายกฎ B1–B5,B7 เข้า strict_rules
2. **`Settings.tsx`**: เพิ่ม card "Persona & Domain Rules" (ai_persona + allowed_service_types + forbidden_terms + tier_special_rules + intent_collection_order) และ card "กลยุทธ์ส่งรูป" เพิ่ม textarea `image_selection_rules`
3. **`line-webhook/index.ts`**:
   - แทน hardcode บรรทัด 551, 554, 557, 561, 566, 574, 576–581, 598–602 ด้วย cfg.*
   - บล็อก `imageListStr` (บรรทัด 506) — ส่วน "💡 กฎเลือกสื่อ" ใช้ `cfg.image_selection_rules`
   - บล็อก `promoContext` rules (บรรทัด 481–485) → ย้ายเข้า strict_rules (ลบทิ้งจาก code)
   - `trivial` array → `cfg.trivial_replies`
   - `taxKeyword` regex → build จาก `cfg.tax_id_keywords`
   - `customerTurns` + intent logic เก็บไว้เหมือนเดิม (เป็น infra)

## ความคิดเห็น
- **แนะนำทำเฉพาะ A1, A2, A3, A4 + ย้าย B1–B5,B7 → strict_rules** ก่อน (impact สูง เปลี่ยน vertical ได้จริง)
- **A5 (intent fields แบบ dynamic)** ข้ามไปก่อน เพราะต้องแก้ schema `customers` ใหญ่ — เฟสหลัง
- **B6, B8 (trivial/tax)** ทำคู่ไปด้วยได้ เพราะแก้ง่าย
- ผลลัพธ์: prompt template สะอาด ขึ้นต้นด้วย `cfg.ai_persona` แล้วต่อด้วย rules ที่ inject จาก cfg ทั้งหมด ธุรกิจ spa/wedding/event/coworking ใช้ได้ทันที โดยแอดมินแก้จาก Settings UI อย่างเดียว
