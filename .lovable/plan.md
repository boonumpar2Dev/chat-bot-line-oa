
## ข้อมูลที่เช็กแล้ว

- `customer_status_log` มี record วันแรก = **19 มิ.ย. 2026** (80 records — น่าจะ backfill ตอนเปิดระบบ)
- ตั้งแต่ **20 มิ.ย.** เป็นต้นไปเป็นข้อมูล log จริงจากการใช้งาน → ใช้ 20 มิ.ย. เป็นจุดเริ่มต้น Reports
- ปัจจุบันหน้า Dashboard กับ Reports มีการ์ดสรุปคล้ายกันปนกัน ทำให้ผู้บริหารงงและตัวเลข "หาย" เมื่อแอดมินเคลีย

## เป้าหมาย

แยกหน้าที่ของ 2 หน้าให้ชัด:

| | Dashboard (แอดมิน) | Reports (ผู้บริหาร) |
|---|---|---|
| มุมมอง | **Realtime / Snapshot ตอนนี้** | **Log ย้อนหลังรายวัน (frozen)** |
| ตัวเลขเปลี่ยน? | เปลี่ยนทันทีตามสถานะ | นิ่งตามวัน ไม่ย้อนเปลี่ยน |
| คลิกได้? | ✅ คลิก → เปิดรายชื่อ → เคลีย | ✅ คลิกดูรายชื่อ read-only |
| คำถามที่ตอบ | "ตอนนี้มีอะไรค้าง ต้องทำอะไรต่อ" | "เมื่อวานแอดมินทำงานไปเท่าไหร่ ช้า/เร็ว" |

---

## หน้า Dashboard — Realtime Action Center

เน้น "งานค้างตอนนี้" คลิกเคลียได้

**การ์ดหลัก (snapshot ปัจจุบัน):**
1. **รอทำใบเสนอราคา** = count customers ที่ status = `pending_quote` ตอนนี้ → คลิก → list
2. **รอคอนเฟิร์ม** = count customers ที่ status = `pending_confirm` ตอนนี้ → คลิก → list
3. **SLA เกินกำหนด** (มีอยู่แล้ว)
4. **Lead วันนี้** (New / Returning / Legacy — มีอยู่แล้ว)
5. **Top CLV / Recent** (มีอยู่แล้ว)

**ลบออกจาก Dashboard:** การ์ดที่เป็น "วันนี้เข้ามากี่ใบ / ส่งกี่ใบ" แบบ log → ย้ายไป Reports

---

## หน้า Reports — Executive Log

เน้น "log รายวัน ดูประสิทธิภาพแอดมิน" (frozen numbers)

**โครงสร้าง:**

### A. Summary 7 วันล่าสุด (ตั้งแต่ 20 มิ.ย.)
ตาราง 1 แถว/วัน คอลัมน์:
| วันที่ | ลูกค้าใหม่ | ได้ข้อมูลครบ | ส่งใบเสนอราคา | คอนเฟิร์ม |
|---|---|---|---|---|
| | (จำนวน) | ใหม่+วันนี้ / ค้างเก่า+วันนี้ / **รวม** | ใหม่+วันนี้ / ค้างเก่า+วันนี้ / **รวม** | (จำนวน) |

ทุกตัวเลขนับจาก `customer_status_log` (transition ในวันนั้น) → frozen ไม่เปลี่ยน

### B. Funnel กราฟ (มีอยู่แล้วใน DashboardExtraSections)
- กราฟแสดง trend 7/30 วัน

### C. คลิกดูรายชื่อ (read-only)
คลิกตัวเลขใดๆ → modal แสดงรายชื่อลูกค้าที่ transition ในวันนั้น (ไม่ให้แก้ในหน้านี้ — เปิดได้แค่ link ไป /chats)

---

## Logic ตัวเลข (ทั้ง 2 หน้าใช้สูตรเดียวกัน แต่กรองคนละแบบ)

**Dashboard (Realtime):**
```
รอทำใบ   = customers WHERE status='pending_quote' NOW
รอคอนเฟิร์ม = customers WHERE status='pending_confirm' NOW
```

**Reports (Log per วัน D):**
```
ลูกค้าใหม่    = customers WHERE created_at::date = D
ได้ข้อมูลครบ  = status_log WHERE new_status='pending_quote' AND changed_at::date = D
  ├─ ใหม่+วันนี้ = ข้างบน AND customer.created_at::date = D
  └─ ค้างเก่า   = ข้างบน AND customer.created_at::date < D
ส่งใบเสนอราคา = status_log WHERE new_status='pending_confirm' AND changed_at::date = D
  ├─ ใหม่+วันนี้ = ข้างบน AND customer.created_at::date = D
  └─ ค้างเก่า   = ข้างบน AND customer.created_at::date < D
คอนเฟิร์ม    = status_log WHERE new_status IN ('confirmed','confirmed_returning') AND changed_at::date = D
```

---

## ไฟล์ที่จะแก้

1. **`src/pages/Dashboard.tsx`** — เพิ่มการ์ด "รอทำใบ / รอคอนเฟิร์ม" (realtime, คลิกได้) ลบส่วนที่เป็น log ออก
2. **`src/pages/Reports.tsx`** — เปลี่ยนเป็นตาราง daily log + เก็บ Funnel charts เดิม
3. **`src/components/dashboard/DashboardExtraSections.tsx`** — แยกออกเป็น 2 ส่วน: ส่วน Realtime ย้ายไป Dashboard, ส่วน Log อยู่ Reports (หรือสร้าง component ใหม่ `DailyReportTable` แทน)

---

## ผลกระทบกับของเดิม

✅ ไม่กระทบ: line-webhook, AI flow, KB, การส่งข้อความ, การ์ดคอนเฟิร์ม, customer detail
✅ ไม่กระทบ schema/DB — ใช้ตารางเดิม (`customers`, `customer_status_log`)
⚠️ Dashboard หน้าตาเปลี่ยน — การ์ดสรุปเก่าบางอันหายไป (ย้ายไป Reports)
⚠️ Reports หน้าตาเปลี่ยนใหญ่ — focus ที่ตารางรายวันแทนการ์ดสรุปรวม
⚠️ ตัวเลขใน Reports จะ "ดูเยอะกว่าเดิม" เพราะนับจาก log (ของจริงที่เกิดในวันนั้น) ไม่ใช่ snapshot

## คำถามก่อนเริ่ม

- ตาราง Reports ดู 7 วันล่าสุดพอ หรืออยากเลือกช่วง/เดือนได้ด้วย?
- ในตาราง Reports อยากให้รวม **"คงค้างสะสมสิ้นวัน"** (เช่น สิ้นวันที่ 24 มี pending_quote ค้าง X คน) เป็นคอลัมน์เพิ่มไหม? — มีประโยชน์ให้ผู้บริหารเห็น backlog สะสม
