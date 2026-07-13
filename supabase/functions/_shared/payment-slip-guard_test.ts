// Tests for PaymentSlipGuard (Deno.test — mirrors admin-handoff-guard_test.ts)
import { evaluatePaymentSlipGuard } from "./payment-slip-guard.ts";

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error("Assertion failed: " + msg);
};
const assertEq = <T>(a: T, b: T, msg: string) => {
  if (a !== b) throw new Error(`Assertion failed: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const SLIP_DEPOSIT = `
โอนเงินสำเร็จ
ธนาคารกสิกรไทย K PLUS
จำนวนเงิน 5,000.00 บาท
ค่าธรรมเนียม 0.00 บาท
เลขที่รายการ 20260713XXXX
วันที่ 13/07/2026 14:22
`;

const SLIP_BALANCE_LARGE = `
โอนเงิน สำเร็จ
SCB EASY
ยอดเงิน 12,500 บาท
Ref. 987654
13/07/2026 15:00
`;

const SLIP_NO_AMOUNT_LABEL = `
โอนเงินสำเร็จ
พร้อมเพย์
Ref. 12345
13/07/2026 10:00
`;

const NON_SLIP_MENU = `
เมนูอาหาร:
- ผัดไทย 80 บาท
- ต้มยำ 120 บาท
ยินดีต้อนรับสู่ร้านเรา
`;

const NON_SLIP_CHAT = `
ลูกค้า: ราคาเท่าไหร่คะ
แอดมิน: 5,000 บาทค่ะ
`;

Deno.test("deposit slip in pending_confirm → deposit_slip_received with amount 5000", () => {
  const r = evaluatePaymentSlipGuard({
    lifecycle: "pending_confirm",
    ocrText: SLIP_DEPOSIT,
  });
  assert(r.matched, "should match");
  assertEq(r.category, "deposit_slip_received", "category");
  assertEq(r.amount, 5000, "amount");
  assert(r.replyText.includes("5,000 บาท"), "reply has amount");
  assert(r.replyText.includes("ตรวจสอบยอดและประสานรายละเอียด"), "deposit copy");
});

Deno.test("balance slip in confirmed → balance_slip_received with amount 12500", () => {
  const r = evaluatePaymentSlipGuard({
    lifecycle: "confirmed",
    ocrText: SLIP_BALANCE_LARGE,
  });
  assert(r.matched, "should match");
  assertEq(r.category, "balance_slip_received", "category");
  assertEq(r.amount, 12500, "amount");
  assert(r.replyText.includes("12,500 บาท"), "reply has amount");
  assert(r.replyText.includes("ตรวจสอบและประสานงานต่อ"), "balance copy");
});

Deno.test("balance slip in completed lifecycle also matches", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "completed", ocrText: SLIP_BALANCE_LARGE });
  assert(r.matched, "should match in completed");
  assertEq(r.category, "balance_slip_received", "category=balance for completed");
});

Deno.test("slip with weak amount evidence still matches (no amount in reply)", () => {
  const r = evaluatePaymentSlipGuard({
    lifecycle: "pending_confirm",
    ocrText: SLIP_NO_AMOUNT_LABEL,
  });
  assert(r.matched, "matched");
  assertEq(r.amount, null, "no amount parsed");
  assert(!r.replyText.match(/\d/), "reply must not contain digits");
});

Deno.test("non-slip menu text → no match", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: NON_SLIP_MENU });
  assert(!r.matched, "should not match");
});

Deno.test("non-slip chat screenshot → no match (weak signals)", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: NON_SLIP_CHAT });
  assert(!r.matched, "should not match");
});

Deno.test("slip but lifecycle unsupported (inquiry) → no match", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "inquiry", ocrText: SLIP_DEPOSIT });
  assert(!r.matched, "unsupported lifecycle");
  assert(r.reason.startsWith("lifecycle-not-supported"), "reason");
});

Deno.test("empty OCR → no match", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: "" });
  assert(!r.matched, "no match");
  assertEq(r.reason, "no-ocr-text", "reason");
});

Deno.test("disabled config → no match", () => {
  const r = evaluatePaymentSlipGuard({
    lifecycle: "pending_confirm",
    ocrText: SLIP_DEPOSIT,
    config: { enabled: false },
  });
  assert(!r.matched, "disabled");
  assertEq(r.reason, "disabled", "reason");
});

Deno.test("amount extraction ignores fee line (ค่าธรรมเนียม 0.00)", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: SLIP_DEPOSIT });
  assertEq(r.amount, 5000, "should pick 5000 not 0");
});

Deno.test("integer amount formatted without .00", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: SLIP_DEPOSIT });
  assert(r.replyText.includes("5,000 บาท") && !r.replyText.includes("5,000.00"), "no trailing .00");
});

Deno.test("reply never contains reference/account numbers", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: SLIP_DEPOSIT });
  assert(!r.replyText.includes("20260713"), "no ref");
});

Deno.test("reply never asks a follow-up question", () => {
  const r = evaluatePaymentSlipGuard({ lifecycle: "pending_confirm", ocrText: SLIP_DEPOSIT });
  assert(!r.replyText.includes("?") && !r.replyText.includes("ไหม") && !r.replyText.includes("มั้ย"), "no question");
});
