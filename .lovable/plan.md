
## เป้าหมาย

1. ส่วน **AI Context Cache** และตัวเลข Token ในหน้า Settings → ให้เห็นเฉพาะ **admin**
2. เพิ่มระบบ **Role Permissions** ให้ admin กำหนดได้ว่า role ไหน (manager/staff) เห็นเมนูใดได้บ้าง — รองรับการสร้าง user ใหม่สำหรับธุรกิจอื่นในอนาคต

---

## 1) ซ่อน AI Context Cache เฉพาะ admin

ใน `src/pages/Settings.tsx`:
- ใช้ `const { role } = useAuth()` แล้วครอบการ์ด AI Context Cache (รวม fetch/state) ด้วย `{role === "admin" && ...}`
- ถ้ามีการแสดง token count ในส่วนอื่น (เช่นใต้กล่อง KB) ก็ซ่อนด้วยเงื่อนไขเดียวกัน
- ผู้ใช้ที่ไม่ใช่ admin จะไม่เห็น/ไม่ยิง query ตารางนี้

---

## 2) ระบบ Role Permissions (เลือกเมนูตาม role)

### Database

ตารางใหม่ `role_menu_permissions`:
- `role` (app_role, PK) — manager / staff (admin ไม่ต้องเก็บ เพราะเห็นทุกอย่างเสมอ)
- `menu_keys` (text[]) — เช่น `['dashboard','chats','knowledge','settings']`
- `updated_at`

Default seed:
- manager → ทุกเมนูยกเว้น `users`
- staff → `chats` อย่างเดียว

RLS:
- SELECT: authenticated ทุกคน (ต้องอ่านเพื่อใช้กรองเมนูฝั่ง client)
- INSERT/UPDATE/DELETE: เฉพาะ `has_role(auth.uid(), 'admin')`

### Frontend

**`src/components/AppLayout.tsx`**
- เพิ่ม `menu_key` ให้แต่ละรายการ nav (`dashboard`, `chats`, `knowledge`, `users`, `settings`)
- โหลด `role_menu_permissions` ครั้งเดียวตอน mount (cache ใน context หรือ hook ใหม่ `useMenuPermissions`)
- กรองเมนู:
  - admin → เห็นทุกเมนู
  - อื่นๆ → เห็นเฉพาะ menu_keys ของ role ตัวเอง (`users` ยังคงเงื่อนไข adminOnly แข็งๆ เพิ่ม)

**`src/components/ProtectedRoute.tsx`**
- เพิ่ม prop `menuKey?: string` — ถ้าผู้ใช้ไม่มีสิทธิ์เข้า menu นั้น redirect ไป `/`
- เคสที่ไม่ผ่าน guard ฝั่ง URL (พิมพ์เอง) จะถูกบล็อก

**หน้า Settings (admin section ใหม่)**
- เพิ่มการ์ด "สิทธิ์เมนูตามบทบาท" (เฉพาะ admin):
  - แสดง 2 แถว: Manager / Staff
  - แต่ละแถวมี checkbox list ของเมนูทั้งหมด
  - ปุ่ม "บันทึก" → upsert ลง `role_menu_permissions`

---

## 3) เทคนิคและความปลอดภัย

- การกรองเมนูที่ client เป็นเพียง UX — สิทธิ์ข้อมูลจริงยังคุมด้วย RLS เดิมในตารางต่างๆ (ไม่เปลี่ยน)
- `users` page ยัง hard-lock ที่ `adminOnly` ใน `ProtectedRoute` ป้องกันคนเปิด permission ผิดพลาด
- ถ้าธุรกิจอื่นในอนาคตต้องการ role เพิ่ม (เช่น `sales`) — แค่เพิ่มค่าใน enum `app_role` + แถวใน `role_menu_permissions`

---

## ไฟล์ที่แก้ไข/สร้าง

- migration: ตาราง `role_menu_permissions` + RLS + seed
- `src/components/AppLayout.tsx` — กรองเมนูตาม permission
- `src/components/ProtectedRoute.tsx` — รองรับ `menuKey`
- `src/App.tsx` — ใส่ `menuKey` ให้แต่ละ route
- `src/pages/Settings.tsx` — ซ่อน AI Context Cache เฉพาะ admin + การ์ดตั้งค่าสิทธิ์เมนูใหม่
- (optional) `src/hooks/useMenuPermissions.tsx` — โหลด+cache permission map

---

## คำถามก่อนเริ่ม

- เห็นด้วยกับ default: **manager เห็นทุกเมนูยกเว้นจัดการผู้ใช้, staff เห็นเฉพาะแชท** หรือต้องการเริ่มต้นแบบอื่น?
