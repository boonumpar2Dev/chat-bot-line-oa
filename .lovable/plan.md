# แผน: ระบบสอน AI จากแชท + เมนู "AI แนะนำเข้า KB"

สรุปจากที่ตกลงกัน:
1. Split KB กลาง / Note ลูกค้า → **admin เลือกเอง** (มี hint ช่วย)
2. Auto-suggest → **Hybrid C** (embedding + AI summary), **manual scan เท่านั้น** + เลือก **ช่วงวันที่ได้**
3. เกณฑ์ → default + 3-level slider (เข้ม/กลาง/ผ่อน) + AI filter noise
4. ชื่อเมนู → **"AI แนะนำเข้า KB"** ใต้ Knowledge Base

---

## Part A — ปุ่ม 🧠 "สอน AI" บนบับเบิลแอดมิน (ในหน้าแชท)

**UX:**
- Hover/tap บับเบิลแอดมิน → icon 🧠 มุมบับเบิล
- คลิก → Dialog "สอน AI จากข้อความนี้"
  - แสดงข้อความลูกค้าก่อนหน้า (auto-detect = Question) + ข้อความแอดมิน (Answer) ให้แก้ได้
  - **Radio 2 ตัว:**
    - 🌐 **KB กลาง** — ลูกค้าทุกคนใช้ได้ (default ถ้าข้อความทั่วไป)
    - 👤 **Note เฉพาะลูกค้าคนนี้** — เช่น แพ้อาหาร, ที่อยู่พิเศษ
  - ถ้าเลือก KB กลาง → เลือก category
  - ปุ่ม "บันทึก" (manual confirm)

**Storage:**
- KB กลาง → insert `knowledge_base` ตามปกติ + trigger embed
- Note ลูกค้า → เพิ่ม column `customers.customer_notes jsonb` (array of `{q, a, created_at, created_by}`) — prompt-builder ดึงเฉพาะตอนคุยกับลูกค้าคนนั้น

---

## Part B — เมนูใหม่ "AI แนะนำเข้า KB"

**ตำแหน่ง:** Sidebar กลุ่ม "AI" ใต้ "สอน AI" → route `/kb-suggestions`

**UX หน้าหลัก:**
```text
┌─ AI แนะนำเข้า KB ────────────────────────┐
│ ช่วงวันที่: [01/06/26] - [12/06/26]      │
│ ความเข้มงวด: 🟢━━●━━🔴  (กลาง)           │
│ [🔍 สแกนเลย]   สแกนล่าสุด: 3 วันก่อน    │
├──────────────────────────────────────────┤
│ Tabs: รอตรวจ (12) | เพิ่มแล้ว | ไม่ใช่   │
├──────────────────────────────────────────┤
│ [Card] Q: ส่งฟรีไหม                       │
│        A: ส่งฟรีในกรุงเทพ ออเดอร์ ≥3000  │
│        🔁 พบ 5 ครั้ง · 3 ลูกค้า          │
│        [👁 ดูต้นทาง] [✏️ แก้] [✅ เพิ่ม] [❌] │
└──────────────────────────────────────────┘
```

**Flow สแกน (กดปุ่ม):**
1. Edge function `scan-kb-suggestions` รับ `{from, to, strictness}`
2. ดึง messages ของแอดมิน (role=admin) ในช่วงวัน + คู่กับ user message ก่อนหน้า
3. **Stage 1 (Embedding A):** embed admin messages → cluster by cosine ≥ threshold (เข้ม 0.90 / กลาง 0.85 / ผ่อน 0.78)
4. Filter: cluster ต้องมี ≥ min_count (เข้ม 5/2c, กลาง 3/2c, ผ่อน 2/1c)
5. **Stage 2 (AI B):** ส่งแต่ละ cluster ให้ Gemini สรุปเป็น Q/A สะอาด + filter noise (ทักทาย/ตอบสั้น)
6. Insert `kb_suggestions` (pending) — ข้ามถ้า similar กับ KB ที่มีอยู่แล้ว (cosine ≥ 0.92)

**กดเพิ่ม:** insert `knowledge_base` + trigger embed + mark suggestion = approved
**กดไม่ใช่:** mark dismissed (จำไว้ไม่เสนอซ้ำ — เก็บ embedding ของ Q ไว้เทียบ)

---

## Technical details

### Migration
```sql
-- 1. customer_notes
ALTER TABLE customers ADD COLUMN customer_notes jsonb NOT NULL DEFAULT '[]';

-- 2. kb_suggestions
CREATE TABLE kb_suggestions (
  id uuid PK, suggested_q text, suggested_a text,
  source_message_ids uuid[], customer_ids uuid[],
  occurrence_count int, category_id uuid NULL,
  status text CHECK IN ('pending','approved','dismissed'),
  scan_from date, scan_to date, strictness text,
  dismissed_embedding vector(768) NULL,  -- เทียบกันรอบหน้า
  created_at, updated_at, reviewed_by, reviewed_at
);
-- + GRANT + RLS (admin/manager/owner only)

-- 3. app_settings: เพิ่ม column kb_suggest_last_scan_at, kb_suggest_strictness
```

### Files ใหม่/แก้
- **ใหม่:**
  - `src/pages/KbSuggestions.tsx`
  - `src/components/chats/TeachAiDialog.tsx`
  - `supabase/functions/scan-kb-suggestions/index.ts`
  - `supabase/functions/approve-kb-suggestion/index.ts`
- **แก้:**
  - `src/App.tsx` — route ใหม่
  - `src/components/AppLayout.tsx` — เมนูใหม่
  - `src/pages/Chats.tsx` — ปุ่ม 🧠 บนบับเบิลแอดมิน + dialog
  - `supabase/functions/_shared/prompt-builder.ts` — ดึง `customer_notes` ใส่ใน context (~5 บรรทัด)

### ผลกระทบกับของเดิม (สำคัญ)
- ✅ `prompt-builder` — เพิ่มเฉพาะ section ใหม่ ไม่กระทบ KB/Pkg/Promo flow
- ✅ `knowledge_base` — insert ปกติ ใช้ flow embed เดิม
- ✅ Chats.tsx — เพิ่ม overlay button เฉพาะบับเบิลแอดมิน, ไม่แก้ logic ส่งข้อความ
- ⚠️ Token cost: Stage 2 AI summary จะใช้ Gemini tokens ตามจำนวน cluster (กำหนด max 30 cluster/scan กันบาน)
- ⚠️ scan-kb-suggestions ใช้เวลา ~10-30s แล้วแต่ปริมาณ → ใช้ progress UI

---

## ทำเป็นเฟส
1. **Phase 1** (Part A): customer_notes + Dialog "สอน AI" บนบับเบิล + prompt-builder
2. **Phase 2** (Part B): table + page + edge function สแกน + approve flow

ทำต่อเนื่องกัน หรือจะให้ทำ Phase 1 ก่อนแล้วทดสอบ?
