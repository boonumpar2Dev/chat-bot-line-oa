
## เป้าหมาย

เปลี่ยนรูปแบบการจัดการผู้ใช้:
1. **ปิดสมัครเอง** — admin เป็นคนเพิ่ม user เท่านั้น
2. ตอนเพิ่ม → กรอก email + password + เลือก role + **เลือกสิทธิ์เมนูเฉพาะ user คนนั้น**
3. การ์ด "สิทธิ์เมนูตามบทบาท" → ตัดออก เหลือเป็น **คำอธิบายสั้นๆ** ว่าระบบ default ของแต่ละ role เห็นอะไรบ้าง (read-only)

---

## เปลี่ยนจาก role-based → per-user permissions

ปัจจุบัน: สิทธิ์เมนูผูกกับ role (`role_menu_permissions`) → ถ้าธุรกิจอื่นต้องการให้ staff คน A เห็นเมนูต่างจาก staff คน B ทำไม่ได้

ใหม่: เก็บสิทธิ์ **ต่อ user**
- ตาราง `user_menu_permissions` (user_id PK, menu_keys text[])
- ตอน admin เพิ่ม user → insert ทั้ง auth.users + profile + role + menu_permissions ในชุดเดียว
- ตอน admin แก้ user → แก้ menu_keys ของคนนั้น

ลบ/หยุดใช้ `role_menu_permissions` (เก็บไว้ก่อนเผื่อ rollback หรือ drop ทีหลัง)

---

## Database

ตารางใหม่ `user_menu_permissions`:
- `user_id` uuid PK
- `menu_keys` text[]
- `updated_at`

RLS: SELECT/ALL → admin เท่านั้น (ใช้ `has_role`)
+ user เห็น row ของตัวเองได้ (เพื่อ filter sidebar)

---

## Edge Function: `admin-create-user`

ใช้ service role key (admin client) เพื่อสร้าง auth user แทน user (เพราะ supabase.auth.signUp ฝั่ง client จะ login เป็น user ใหม่ทันที)

Input: `{ email, password, display_name, role, menu_keys }`
Guard: เช็ค caller เป็น admin ด้วย `supabase.auth.getUser()` + `has_role`
Steps:
1. `admin.auth.createUser({ email, password, email_confirm: true })`
2. trigger `handle_new_user` จะสร้าง profile + role 'staff' อัตโนมัติ → overwrite role ที่เลือก
3. insert `user_menu_permissions`

แก้ trigger `handle_new_user`: ไม่ auto-assign "staff" role ก็ได้ ปล่อยให้ edge function จัดการเอง (หรือคงไว้แล้ว overwrite — เลือกแบบหลังเพื่อ minimal change)

---

## Frontend

### `src/pages/Auth.tsx`
- ลบ tab "สมัคร" เหลือเฉพาะ login
- เพิ่มข้อความ "การเพิ่มผู้ใช้ใหม่ทำได้โดยแอดมินเท่านั้น"

### `src/pages/Users.tsx`
- **ปุ่ม "+ เพิ่มผู้ใช้"** ด้านบน → เปิด Dialog ฟอร์ม:
  - Email, Password, ชื่อแสดง
  - Select role (admin/manager/staff)
  - Checkbox list ของเมนู (default ตาม role ที่เลือก แต่แก้ได้)
  - ปุ่มบันทึก → เรียก edge function `admin-create-user`
- **แต่ละแถว user**: เพิ่มปุ่ม "แก้สิทธิ์เมนู" → Dialog เลือก checkbox เมนูอีกครั้ง → upsert `user_menu_permissions`
- **ตัดการ์ด `RolePermissionsCard` ออก** แทนด้วยการ์ดคำอธิบาย:
  > **บทบาทและสิทธิ์เริ่มต้น**
  > - Admin: เห็นและจัดการทุกเมนู
  > - Manager: default = Dashboard, แชท, สอน AI, ตั้งค่า
  > - Staff: default = แชท เท่านั้น
  > สิทธิ์เมนูจริงตั้งต่อรายบุคคลที่ปุ่ม "แก้สิทธิ์เมนู"

### `src/components/AppLayout.tsx` + `src/hooks/useMenuPermissions.tsx`
- เปลี่ยนจากโหลด `role_menu_permissions` → โหลด `user_menu_permissions` ของ user ที่ login อยู่
- ถ้า user ยังไม่มี row → fallback default ตาม role (เพื่อความเข้ากันได้กับ user เก่า)
- admin เห็นทุกเมนูเสมอ (เหมือนเดิม)

### `src/components/ProtectedRoute.tsx`
- ใช้ permission ของ user ตัวเอง (ผ่าน hook เดิม) ไม่ต้องแก้มาก

---

## ไฟล์ที่แก้ไข/สร้าง

- migration: ตาราง `user_menu_permissions` + RLS
- edge function ใหม่: `supabase/functions/admin-create-user/index.ts`
- `src/pages/Auth.tsx` — ตัด signup
- `src/pages/Users.tsx` — ปุ่มเพิ่ม + dialog + ปุ่มแก้สิทธิ์ต่อแถว + การ์ดคำอธิบาย
- `src/hooks/useMenuPermissions.tsx` — โหลด per-user permission แทน role-based + เพิ่ม default fallback
- `src/components/AppLayout.tsx` — ใช้ permission ใหม่

---

## คำถามก่อนเริ่ม

1. ผู้ใช้เก่าที่มีอยู่แล้วในระบบ → ระหว่างที่ยังไม่ตั้งสิทธิ์ใหม่ ให้ใช้ default ตาม role ไปก่อน OK ใช่ไหม?
2. ตอน admin เพิ่ม user — ต้องการ **กำหนด password เอง** หรืออยากเป็น **ส่งลิงก์ invite ทาง email** ให้ user ตั้ง password เอง?
   - กำหนดเอง = ง่ายและเร็ว แต่ admin ต้องส่ง password ให้คนนั้นเอง
   - Invite link = professional กว่า แต่ต้องตั้ง email infra (ขอ custom SMTP)
3. หน้า `/auth` — ตัด tab สมัครออกอย่างเดียวก็พอ ใช่ไหม? (ไม่ต้องเพิ่ม "ลืมรหัสผ่าน")
