
## เป้าหมาย

แยก **AI Context Cache** และตัวแสดง Token ออกจากหน้า Settings มาเป็น **เมนูใหม่** ของตัวเอง (admin เท่านั้น) เพื่อให้ดู/จัดการง่ายขึ้นและในอนาคตขยายเป็น dashboard ติดตาม token usage ได้

---

## เมนูใหม่: "AI Tokens"

- เส้นทาง: `/ai-tokens`
- ไอคอน: `Zap` หรือ `Gauge` (lucide)
- ตำแหน่งใน sidebar: ใต้ "จัดการผู้ใช้" (admin-only เหมือนกัน) ก่อน "ตั้งค่า"
- สิทธิ์: **admin เท่านั้น** (hard-lock ด้วย `adminOnly` ใน `ProtectedRoute` — ไม่ผ่านระบบ role permissions ทั่วไป เพราะเป็นข้อมูล internal)

---

## เนื้อหาในหน้า

### 1) สรุปรวม (header)
- การ์ดด้านบนแสดง total tokens ของทุก cache block + เวลา rebuild ล่าสุด
- ปุ่ม "Rebuild ทั้งหมด" (เรียก edge function `rebuild-ai-cache`)

### 2) รายการ cache blocks (จาก `ai_context_cache`)
- การ์ดละ 1 block: kb_summary / packages_summary / promotions_summary
- แสดง: ชื่อ, จำนวนรายการ, token count, updated_at
- ปุ่ม "ดูเนื้อหา" → dialog แสดง `content` (อ่านอย่างเดียว) เพื่อ debug ได้

### 3) (เผื่ออนาคต ยังไม่ทำในรอบนี้)
- กราฟ token usage ต่อวัน
- จำนวนข้อความที่ผ่าน summarize-conversation
- token budget ปัจจุบัน (KB 3000 / Pkg 2000 / Promo 800 / History 2000)

---

## ไฟล์ที่แก้ไข/สร้าง

- **สร้าง** `src/pages/AiTokens.tsx` — ย้าย `AiCacheCard` จาก `Settings.tsx` มาเป็นเนื้อหาหลัก + ปรับ layout เป็นหน้าเต็ม
- **แก้** `src/pages/Settings.tsx` — เอา `AiCacheCard` ออก (ลบทั้ง render และ component declaration), ลบ import ที่ไม่ใช้ (Zap, RefreshCw)
- **แก้** `src/App.tsx` — เพิ่ม route `/ai-tokens` ใต้ AppLayout + ครอบด้วย `ProtectedRoute adminOnly`
- **แก้** `src/components/AppLayout.tsx` — เพิ่มรายการ nav `{ to: "/ai-tokens", label: "AI Tokens", icon: Zap, key: "ai_tokens", adminOnly: true }`
- **แก้** `src/hooks/useMenuPermissions.tsx` — เพิ่ม `"ai_tokens"` ใน `MenuKey` type และ `ALL_MENUS` (แต่จะถูก filter ออกในหน้าตั้งค่าสิทธิ์เพราะ admin-only)

> ไม่ต้อง migration DB — ใช้ตาราง `ai_context_cache` เดิม

---

## คำถามก่อนเริ่ม

1. ชื่อเมนูเอาว่า **"AI Tokens"** หรืออยากเปลี่ยนเป็น **"AI Cache"** / **"AI Usage"** / อื่นๆ?
2. ต้องการให้เพิ่ม "ดูเนื้อหา cache" (dialog) ในรอบนี้เลยไหม หรือเอาแค่สรุป + ปุ่ม rebuild พอ?
