# แผนงาน 2 เรื่อง: ระบบจำลูกค้าเก่า + ระบบ Tag/Broadcast

## ปัญหาที่พบจากตัวอย่างแชท (Ufe2388f...)

ลูกค้ารายนี้ status = `returning`, มี event_type/guest_count/event_date แล้ว แต่ AI ยังตอบเหมือนลูกค้าใหม่ — เพราะ logic ปัจจุบันใน `line-webhook` ดู "ลูกค้าเก่า" จาก **มีเบอร์โทร** เท่านั้น ไม่ได้ดูจาก `status`, `contact_year`, `clv_amount`, หรือประวัติงานเก่า

---

## ส่วนที่ 1: ระบบจำ/ตอบลูกค้าเก่า (Returning Customer Awareness)

### 1.1 นิยาม "ลูกค้าเก่า" ที่ AI ควรรู้ (มี 3 ระดับ)

| ระดับ | เงื่อนไข | สไตล์การตอบ |
|---|---|---|
| **VIP / ซ้ำ** | `status='confirmed'` หรือ `clv_amount>0` หรือเคยจัดงานแล้ว | ทักทายแบบรู้จัก ไม่ถามข้อมูลพื้นฐานซ้ำ ชวนคุยงานใหม่เลย |
| **Returning** | `status='returning'` หรือ `contact_year < ปีปัจจุบัน` หรือเคยทักครั้งก่อน >30 วัน | ทักทายแบบ "ยินดีต้อนรับกลับนะคะ" + ถามว่างานครั้งนี้คล้ายเดิมไหม |
| **Active lead** | มี intent ครบ (event_type+guest+date) แต่ยังไม่ confirm | ไม่ทักทายใหม่ คุยต่อจากที่ค้าง |

### 1.2 เปลี่ยน prompt ให้ AI รู้บริบท

แก้ `line-webhook/index.ts` ช่วงสร้าง `returningPrompt`:
- เพิ่ม block `🟢 บริบทลูกค้า` ที่บอก AI ว่าลูกค้าระดับไหน + ประวัติงานเก่า (event_type/date ครั้งก่อน) + tags
- เพิ่มกฎ "ห้ามทักทายแบบลูกค้าใหม่ ถ้า status ≠ 'new'"
- ถ้ามี `conversation_summary` หรือเคยจัดงานแล้ว → AI ต้องอ้างถึงบ้าง (เช่น "งานทำบุญรอบที่แล้วเป็นยังไงบ้างคะ")

### 1.3 ตั้งค่าได้ใน UI (ไม่ hardcode)

เพิ่มฟิลด์ใน `app_settings` + UI หน้า "ตั้งค่า AI":
- `returning_customer_greeting` (text) — template ทักทายลูกค้าเก่า เช่น "ยินดีต้อนรับกลับค่ะคุณ{ชื่อ}"
- `vip_customer_greeting` (text) — template สำหรับ VIP
- `returning_skip_intent_questions` (bool, default true) — ถ้าเคยมี event_type/guest_count ห้ามถามซ้ำ
- `returning_days_threshold` (int, default 30) — เงียบกี่วันถึงนับเป็น returning

### 1.4 (ออปชัน) เก็บประวัติงานเก่าแยก

ปัจจุบัน customer มี event_* แค่งานเดียว (overwrite ทุกครั้ง) — ถ้าอยากให้ AI จำได้ว่าเคยจัดงานอะไรบ้าง ควรเพิ่มตาราง `customer_events`:
```
customer_events: id, customer_id, event_type, guest_count, event_date, 
                 venue, package_name, total_amount, status, created_at
```
แอดมินกดปุ่ม "ปิดงาน/บันทึกประวัติ" บนหน้าแชท → snapshot event ปัจจุบันลง history → reset field บน customer พร้อมรับงานใหม่

> ถ้ายังไม่อยากเพิ่มตอนนี้ ใช้แค่ `conversation_summary` + status ไปก่อนได้

---

## ส่วนที่ 2: ระบบ Tag + Broadcast (จัดกลุ่มลูกค้าเพื่อการตลาด)

ปัจจุบัน customers มี column `tags text[]` อยู่แล้ว แต่ไม่มี UI จัดการรวมศูนย์ + ไม่มี broadcast

### 2.1 ตารางใหม่

```
tags
  id, name (unique), color, description, sort_order, created_at
  -- master list ของ tag ที่ใช้ในระบบ (เพื่อ autocomplete + จัดสี)

broadcast_campaigns
  id, name, message_text, image_urls[], video_urls jsonb,
  target_tags text[],          -- ส่งให้ลูกค้าที่มี tag ใดใน list
  target_status text[],         -- กรองตาม status เพิ่มได้
  target_exclude_tags text[],   -- ยกเว้น tag (เช่น "do-not-contact")
  scheduled_at, sent_at,
  total_recipients, success_count, failed_count,
  status (draft|scheduled|sending|done|failed),
  created_by, created_at
```

### 2.2 เมนูใหม่ในระบบ (แยกเมนู ใช่)

เพิ่ม 2 เมนูใน sidebar (admin/manager):
- **"แท็กลูกค้า"** (`/tags`) — CRUD master tags + ดูจำนวนลูกค้าต่อ tag + bulk assign
- **"Broadcast"** (`/broadcast`) — สร้าง campaign, preview รายชื่อผู้รับ, ส่งทันที/ตั้งเวลา, ดูประวัติ + อัตราส่งสำเร็จ

อัปเดต `MenuKey` type + `ALL_MENUS` + `ROLE_DEFAULTS` ใน `useMenuPermissions.tsx`

### 2.3 ฟีเจอร์ในหน้า Chats (รวมเข้ากับของเดิม)

- Tag chip บน chat list แสดงสีจาก master tag
- ในกล่องรายละเอียดลูกค้า: เปลี่ยน input tag เป็น autocomplete จาก master list + ปุ่มสร้าง tag ใหม่
- ปุ่ม "เลือกหลายรายการ" → bulk add/remove tag

### 2.4 Broadcast flow (Edge function)

สร้าง `broadcast-send` edge function:
1. รับ campaign_id
2. query customers ตาม target_tags/status/exclude → list line_user_id
3. loop ส่งผ่าน LINE push API (rate limit ~500/sec, batch)
4. update success_count/failed_count + log แต่ละ recipient (ตารางย่อย `broadcast_recipients` ถ้าอยากเก็บละเอียด)
5. มี cron job รัน scheduled campaigns

### 2.5 Tag เชื่อมกับ AI

เพิ่มฟิลด์ `ai_tag_instructions` ใน tags (text) — เช่น tag "VIP" → "ลูกค้ารายนี้เป็น VIP ให้ใช้ภาษาทางการขึ้น เสนอแพ็กเกจระดับบนก่อน"
ตอน build prompt เอา instructions ของ tag ที่ลูกค้ามี → ใส่ใน `knownIntentStr`

---

## ลำดับการทำ (แนะนำแบ่งเป็น 3 step ค่อยทำทีละอัน)

**Step A — Returning awareness** (เล็ก เห็นผลทันที)
- เพิ่มฟิลด์ใน app_settings + UI ตั้งค่า AI
- แก้ `returningPrompt` ใน line-webhook ให้ดู status + tags + ประวัติ
- ทดสอบกับ Ufe2388f...

**Step B — Tag management** (กลาง)
- migration: tags table + seed จาก tag เก่าใน customers.tags
- หน้า `/tags` (CRUD + bulk assign)
- อัปเดต Chats ให้ใช้ autocomplete
- เชื่อม `ai_tag_instructions` เข้า prompt

**Step C — Broadcast** (ใหญ่)
- migration: broadcast_campaigns + recipients
- หน้า `/broadcast` (composer + preview + history)
- edge function `broadcast-send` + cron

---

## คำถามก่อนเริ่ม

1. **Step A** ทำเลยก่อนใช่ไหม (เป็น Quick win สำหรับลูกค้าตัวอย่าง)
2. ต้องการตาราง `customer_events` แยกประวัติงานเก่าตอนนี้เลย หรือใช้ `conversation_summary`/status ไปก่อน
3. **Step B และ C** — อยากให้ผมทำต่อทันทีในรอบนี้ หรือแยกรอบ (เพราะ Broadcast มีหลายส่วน เทสยาก)
4. Broadcast — ใช้ LINE push (เปลืองโควต้า LINE) หรือเฉพาะลูกค้าที่ทักภายใน 24ชม. (free reply) เท่านั้น
