
## วิเคราะห์ปัญหาที่เจออยู่ตอนนี้

ระบบมี **3 ที่เก็บความรู้ AI** ปนกันอยู่ ทำให้ User งง ไม่รู้จะใส่ตรงไหน:

| ที่เก็บ | ใช้เมื่อไหร่ | ปัญหา |
|---|---|---|
| `app_settings.ai_persona` | ใส่ใน prompt **ทุกครั้ง** | OK |
| `app_settings.strict_rules` (array) | ใส่ใน prompt **ทุกครั้ง** | ✅ ใช้ตลอด แต่ UI เป็น list สั้นๆ ใส่กฎยาวๆ ลำบาก |
| `app_settings.image_selection_rules` / `tier_special_rules` / `intent_collection_order` / `forbidden_terms` / `allowed_service_types` | ใส่ใน prompt **ทุกครั้ง** | ✅ ใช้ตลอด แต่กระจาย field เยอะ |
| `knowledge_base` (KB) | **ค้นแล้วหยิบเฉพาะที่เกี่ยว** (top-K โดย AI) | ❌ ถ้า User เอา "กฎ" มาใส่ KB → AI หยิบมาบ้างไม่หยิบบ้าง → ตอบไม่สม่ำเสมอ |

→ ปัญหาจริงของ User: **"ถ้าใส่กฎใน KB มันควรใช้ตลอด ไม่ใช่หยิบเลือก"** — ถูกต้อง เพราะ KB ออกแบบมาเพื่อ "ข้อมูลตอบลูกค้า" (เมนู ราคา รีวิว) ไม่ใช่ "วิธีคุย"

## หลักคิด: แยกประเภทความรู้ให้ชัด

```text
┌─────────────────────────────────────────────────────────┐
│  ALWAYS (ใส่ prompt ทุกครั้ง — แพง token แต่จำเป็น)        │
│  ├─ บุคลิก (persona)                                      │
│  └─ กฎการคุย (rules) ← User จัดการที่เดียว                 │
├─────────────────────────────────────────────────────────┤
│  ON-DEMAND (ค้นแล้วหยิบเฉพาะที่เกี่ยว — ประหยัด token)      │
│  └─ ข้อมูลธุรกิจ (KB: เมนู ราคา รีวิว FAQ ตัวอย่าง)         │
└─────────────────────────────────────────────────────────┘
```

**กฎข้อหนึ่ง:** "วิธีคุย/ห้าม/ต้อง" → ALWAYS. "ข้อมูลที่ลูกค้าถาม" → ON-DEMAND.

## เรื่อง Token แพงไหม?

ปัจจุบัน prompt builder ส่งทุก field ทุกครั้งอยู่แล้ว (`strict_rules` + `image_rules` + `tier_rules` + `forbidden` + `persona` ~600-900 token) — **ไม่ได้แพงขึ้น** ถ้ารวมเข้าหน้าเดียว เพราะของเดิมก็ใส่อยู่แล้ว ที่ User คิดว่า "เปลือง" คือเห็น field เยอะแยกกัน รู้สึกว่าเยอะ จริงๆ token เท่าเดิม

ค่าเฉลี่ยลูกค้า 1 รอบ ~3,000-5,000 token (รวม KB+pkg+history) → rules ~15-20% เป็นต้นทุนคงที่ที่จำเป็น **เพื่อให้ AI ตอบสม่ำเสมอ**

## แผนปรับ UX

### A. ยุบ Settings AI tab ให้เหลือ 2 กล่องใหญ่

```text
หน้า Settings > แท็บ "สอน AI"

┌─ 🎭 บุคลิก AI (ใครคุณ พูดยังไง) ──────────────────┐
│ [textarea — 1 ช่อง]                              │
│ "คุณคือ AI ผู้ช่วย ... ใช้ ค่ะ/นะคะ"               │
└──────────────────────────────────────────────────┘

┌─ 📋 กฎ AI (ห้าม/ต้อง/วิธีตอบ) ─────────────────────┐
│ [+ เพิ่มกฎ]                          [12 ข้อ]      │
│ ┌────────────────────────────────────────────┐  │
│ │ #1  ห้ามชวนลูกค้าต่างจังหวัดมาชิม           [✏️🗑] │
│ │ #2  ใช้ "ค่ะ/คะ" เท่านั้น ห้ามใช้ "ครับ"     [✏️🗑] │
│ │ #3  จำนวน "แขก N" = N คน ไม่รวมพระ          [✏️🗑] │
│ │ ...                                          │  │
│ └────────────────────────────────────────────┘  │
│                                                   │
│ 💡 กฎจะถูกส่งให้ AI ทุกครั้งที่ตอบ → ใช้ได้สม่ำเสมอ  │
│    ถ้าเป็นข้อมูลตอบลูกค้า (เมนู ราคา) → ใส่ที่         │
│    "ฐานความรู้" แทน                              │
└──────────────────────────────────────────────────┘
```

ทั้ง `image_selection_rules`, `tier_special_rules`, `forbidden_terms`, `intent_collection_order`, `allowed_service_types` → **ยุบรวมเป็น `strict_rules` ข้อๆ** ที่ User เพิ่ม/ลบ/แก้ได้เหมือนกัน

### B. ที่ Knowledge Base เพิ่ม guard

ตอน save KB ถ้า content มีคำเช่น "ห้าม/ต้อง/อย่า/ใช้คำว่า" → แสดง toast:
> 💡 ดูเหมือนคุณกำลังใส่ **กฎการตอบ** — ควรใส่ที่ Settings > สอน AI > กฎ AI แทน เพื่อให้ AI ใช้ทุกครั้ง (KB จะหยิบมาเฉพาะเมื่อเกี่ยวข้อง)
> [ไปหน้ากฎ AI] [ใส่ใน KB ต่อ]

### C. (ทางเลือก) Migration อัตโนมัติ

ปุ่ม "ดึงกฎจาก KB" — สแกน KB หา item ที่เป็น "กฎ" (heuristic: ขึ้นต้น "ห้าม/ต้อง/อย่า" + ความยาวสั้น) → preview ให้ User กดย้ายเข้า `strict_rules`

### D. (ทางเลือก ขั้นถัดไป) ลด token ด้วย rule grouping

ถ้ากฎเกิน 30 ข้อ → ให้ tag กฎเป็นหมวด (`always`, `เมื่อขอรูป`, `เมื่อพูดราคา`) แล้ว prompt-builder ใส่เฉพาะหมวดที่เกี่ยวกับ intent ลูกค้ารอบนั้น — **ยังไม่ทำตอนนี้** จนกว่ากฎจะเยอะจริง

## สรุปการเปลี่ยนแปลง

### Phase 1 — รวม UI (เน้นที่นี่ก่อน)
1. Settings tab "สอน AI" → เหลือ 2 กล่อง: บุคลิก + กฎ (list)
2. ลบ field แยก (`image_selection_rules`, `tier_special_rules`, `forbidden_terms`, `intent_collection_order`, `allowed_service_types`) ออกจาก UI — **แต่คงคอลัมน์ DB ไว้** (backward compat)
3. Migration ครั้งเดียว: ค่าเดิมใน field พวกนั้น → append เข้า `strict_rules` array
4. `prompt-builder.ts` → อ่านแค่ `persona` + `strict_rules` (ลบ logic ประกอบ field อื่น)

### Phase 2 — กัน User ใส่ผิดที่
5. Knowledge form: detect "rule-like content" → toast แนะนำให้ใส่ที่ Settings

### Phase 3 — (ถ้าต้องการ)
6. ปุ่ม migrate KB→rules
7. Rule grouping เมื่อกฎเยอะ

## รายละเอียดทางเทคนิค

- ไฟล์แก้: `src/pages/Settings.tsx` (ลบ field, เหลือ persona + rules editor), `supabase/functions/_shared/prompt-builder.ts` (ลบส่วนประกอบ field ย่อย)
- Migration data (ใช้ insert tool): UPDATE app_settings SET strict_rules = strict_rules || ARRAY[...เดิมจาก image_selection_rules แตกตามบรรทัด..., tier_special_rules, "ห้ามพูด: " || forbidden_terms, "ลำดับเก็บข้อมูล: " || intent_collection_order, "บริการที่อนุญาต: " || allowed_service_types]
- ไม่ drop columns เผื่อ rollback — แค่ซ่อนจาก UI
- Token impact: 0 (ส่งเท่าเดิม แค่รวม section)

## ขออนุมัติ

ทำ Phase 1+2 เลย หรือเอาแค่ Phase 1 ก่อน? และอยากให้ migrate ค่าเดิมเข้า strict_rules อัตโนมัติเลย หรือให้ User copy เองทีละข้อ?
