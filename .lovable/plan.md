## ระบบ Broadcast (เลียนแบบ LINE Official Account)

### ภาพรวม
หน้า `/broadcast` ให้แอดมินสร้างแคมเปญส่งข้อความหาลูกค้าหลายคนพร้อมกัน — เลือก target ด้วย tag/status, ใส่ข้อความ+รูป+วิดีโอ, ส่งทันทีหรือตั้งเวลา, ดูประวัติ + อัตราสำเร็จ

---

### 1) Database (migration เดียว)

**`broadcast_campaigns`** — แคมเปญหลัก
- `name` (text) — ชื่อแคมเปญสำหรับอ้างอิงภายใน
- `status` — `draft` | `scheduled` | `sending` | `sent` | `failed` | `canceled`
- `target_tags` (text[]) — tag ที่เลือก (OR)
- `target_statuses` (text[]) — status ที่เลือก (OR)
- `target_match_mode` — `any` (tag OR status) | `all` (ต้องมีทั้ง 2 condition)
- `messages` (jsonb) — array ของ message bubbles (ดูโครงสร้างด้านล่าง)
- `scheduled_at` (timestamptz, nullable) — null = ส่งทันที
- `sent_at`, `total_recipients`, `success_count`, `failed_count`
- `created_by` (uuid), `created_at`, `updated_at`

**`broadcast_recipients`** — log ราย user
- `campaign_id` → `broadcast_campaigns.id` (cascade delete)
- `customer_id` → `customers.id`
- `line_user_id` (text)
- `status` — `pending` | `sent` | `failed`
- `error_message` (text, nullable)
- `sent_at` (timestamptz, nullable)

**โครงสร้าง `messages` jsonb** (รองรับ LINE message types):
```json
[
  { "type": "text", "text": "สวัสดีค่ะ ..." },
  { "type": "image", "url": "...", "preview_url": "..." },
  { "type": "video", "url": "...", "thumb_url": "..." },
  { "type": "flex", "alt_text": "...", "contents": { ... } }
]
```

**RLS + GRANTs**: staff อ่าน/เขียนได้ (เหมือน `conversations`)

---

### 2) Edge function: `broadcast-send`

Input: `{ campaign_id }`
Flow:
1. โหลด campaign + ตรวจ status ต้องเป็น `scheduled` หรือ `draft` (manual trigger)
2. Query `customers` ตาม target_tags + target_statuses (มี `line_user_id`)
3. สร้าง `broadcast_recipients` rows (pending) ทั้งหมด
4. Update campaign → `sending` + `total_recipients`
5. Loop ทุก recipient — call LINE `/v2/bot/message/push` (chunk 5 messages/req)
6. Update แต่ละ recipient → `sent` หรือ `failed` พร้อม error
7. นับสรุป → update campaign → `sent` + `success_count` + `failed_count` + `sent_at`
8. บันทึก `conversations` row สำหรับลูกค้าแต่ละคน (ให้ปรากฏใน chat history แบบส่งโดยแอดมิน)
9. Rate limit: หน่วง 100ms ระหว่าง recipient (กัน LINE rate limit)

**Re-use code**: ใช้ logic chunk-5 จาก `line-send-message` (ซึ่งทำไว้แล้วใน issue #777)

---

### 3) Edge function: `broadcast-scheduler` (cron)

รันทุก 1 นาที — query `broadcast_campaigns` ที่ `status='scheduled'` AND `scheduled_at <= now()` แล้ว invoke `broadcast-send`

ติดตั้งผ่าน `pg_cron` + `pg_net` (ใช้ insert tool ตาม instruction)

---

### 4) หน้า `/broadcast` (React)

**Layout**:
- ด้านบน: ปุ่ม "สร้างแคมเปญใหม่"
- ตารางประวัติ: ชื่อ, สถานะ (badge สี), จำนวนผู้รับ, สำเร็จ/ล้มเหลว, เวลาส่ง, การกระทำ (ดู/แก้ draft/ยกเลิก scheduled)

**Composer** (Dialog/Sheet ใหญ่):
- ชื่อแคมเปญ
- **Target Builder**:
  - เลือก tags (multi-select)
  - เลือก statuses (checkbox: new, inquiry, pending_quote, ...)
  - Match mode: ANY / ALL
  - Preview: "พบลูกค้า X คนที่ตรงเงื่อนไข" (query realtime)
- **Message Builder** (สูงสุด 5 bubbles ตาม LINE limit):
  - ปุ่ม "+ ข้อความ" / "+ รูปภาพ" / "+ วิดีโอ" / "+ Flex (JSON)"
  - Drag reorder bubble
  - Image upload → bucket `line-media` (ใช้ของเดิม), preview thumb
  - Video upload → bucket เดิม + thumb_url
  - Flex: textarea JSON พร้อม validate + preview alt_text
- **Schedule**:
  - Radio: "ส่งทันที" / "ตั้งเวลา"
  - ถ้าตั้งเวลา: datetime picker (default = +30 นาที)
- ปุ่มล่าง: "บันทึก draft" / "ส่ง" (หรือ "ยืนยันตั้งเวลา")
- Confirmation modal: "ส่งหา X คน ยืนยัน?"

**ดู detail**: คลิกแถวประวัติ → modal แสดง message preview + ตาราง recipients พร้อม error

---

### 5) Sidebar + Permission

- เพิ่มเมนู "Broadcast" (icon Megaphone) ใน `AppLayout.tsx`
- เพิ่ม key `broadcast` ใน `useMenuPermissions` + UI ใน `/users` ให้กำหนดสิทธิ์
- Default: admin, manager, owner เห็นได้

---

### ผลกระทบกับของเดิม

- เพิ่ม table ใหม่ 2 ตัว — ไม่กระทบ schema เดิม
- เพิ่ม edge function ใหม่ — ไม่แตะ `line-webhook`, `line-send-message`
- เพิ่ม cron job — ไม่ชน job เดิม (`expire-manual-chat`, `follow-up-no-phone`)
- ใช้ bucket `line-media` ร่วมกัน — ไม่ชน path (ใช้ prefix `broadcast/`)
- โหลด LINE quota — แจ้งเตือนใน UI ถ้าจำนวนผู้รับ > 100 ให้ระวัง quota

---

### Phasing (ทำในรอบเดียวจบ)

```text
Step 1: Migration (tables + RLS + GRANT)
Step 2: broadcast-send edge function
Step 3: broadcast-scheduler + cron
Step 4: หน้า /broadcast + composer + history
Step 5: Sidebar + permission
```

หลังเสร็จ — ทดสอบยิงไปลูกค้าทดสอบ 1-2 คนก่อน แล้วค่อยใช้จริง
