// Tests: resolveDateAnchor must NOT use OCR image content as date anchor.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDateAnchor } from "./index.ts";

const Y = 2026;
const OCR = (body: string) => `[รูปภาพ]\n📎 https://example.com/x.jpg\n📄 เนื้อหาในรูป:\n${body}`;

Deno.test("OCR-only customer message with date → NOT anchored, stored unchanged", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: OCR("โพสต์วันที่ 02/10/2025 งานตัวอย่าง") },
    ],
    nickname: null,
    storedEventDate: "2026-11-15",
    todayYear: Y,
  });
  // No customer/admin/nickname evidence after strip → falls back to stored (low)
  assertEquals(r.proposedIso, "2026-11-15");
  assertEquals(r.confidence, "low");
  assertEquals(r.source, "stored_event_date");
});

Deno.test("customer typed date + OCR date in SAME message → typed date wins, OCR ignored", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: `งาน 20 ตุลาคม 2569 ค่ะ\n📄 เนื้อหาในรูป:\nโพสต์วันที่ 02/10/2025` },
    ],
    nickname: null,
    storedEventDate: null,
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-10-20");
  assertEquals(r.confidence, "high");
  assertEquals(r.source, "customer_message");
});

Deno.test("structured stored event_date not overwritten by OCR-only image", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: OCR("25/07/2569 ในโปสเตอร์") },
      { sender: "customer", message: OCR("อีกโพสต์ 02/10/2025") },
    ],
    nickname: null,
    storedEventDate: "2026-12-01",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-12-01");
  assert(r.confidence !== "high");
});

Deno.test("admin OCR block is NOT admin-confirmed date", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "admin", message: OCR("ตามภาพ 25 สค 69") },
    ],
    nickname: null,
    storedEventDate: null,
    todayYear: Y,
  });
  assertEquals(r.proposedIso, null);
  assertEquals(r.confidence, "low");
});

Deno.test("poster with multiple dates in OCR → nothing promoted", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: OCR("02/10/2025\n15/11/2025\n20/12/2025") },
    ],
    nickname: null,
    storedEventDate: null,
    todayYear: Y,
  });
  assertEquals(r.proposedIso, null);
});

Deno.test("customer text-only date still works (regression)", () => {
  const r = resolveDateAnchor({
    messages: [{ sender: "customer", message: "อยากจัด 25 กค 69 ค่ะ" }],
    nickname: null,
    storedEventDate: null,
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-07-25");
  assertEquals(r.confidence, "high");
});

Deno.test("OCR message without any date → no regression, stored preserved", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: OCR("เมนูอาหารไทย โต๊ะจีน") },
    ],
    nickname: null,
    storedEventDate: "2026-09-10",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-09-10");
});
