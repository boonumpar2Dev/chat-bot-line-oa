// Phase 1 tests — Post-Quote No-Reask Guard
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluatePostQuoteNoReaskGuard } from "./post-quote-noreask-guard.ts";

const quoteEvidence = [
  { sender: "customer", message: "รอราคาค่ะ" },
  { sender: "admin", message: "แนบใบเสนอราคาให้ค่ะ" },
];
const fileEvidence = [
  { sender: "admin", message: "[รูปภาพ]\n📎 https://cdn/quote.pdf" },
];

Deno.test("Test 1 — pending_confirm + quote sent + 'เข้าสำรวจพื้นที่วันไหนคะ' → matched (handoff)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "เข้าสำรวจพื้นที่วันไหนคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, true);
  assertEquals(r.matchedPattern !== null, true);
  assertEquals(
    r.replyText,
    "รับทราบค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานงานต่อนะคะ 🙏",
  );
});

Deno.test("Test 1b — 'ทีมงานจะเข้ามาดูสถานที่เมื่อไหร่คะ' → matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ทีมงานจะเข้ามาดูสถานที่เมื่อไหร่คะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, true);
});

Deno.test("Test 1c — admin แนบไฟล์อย่างเดียว (ไม่มีคำ 'ใบเสนอราคา') + site-visit question → matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ขอเข้าดูสถานที่ก่อนได้ไหมคะ",
    recentConvs: fileEvidence,
  });
  assertEquals(r.matched, true);
});

Deno.test("Test 2 — 'กำหนดการงานเป็นยังไงคะ' + evidence → matched (handoff — ให้แอดมินตอบจากข้อมูลจริง)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "กำหนดการงานเป็นยังไงคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, true);
});

Deno.test("Test 3 — status=new + 'สนใจจัดงานค่ะ' → NOT matched (guard skips → normal lead flow)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "new",
    messageText: "สนใจจัดงานค่ะ",
    recentConvs: [],
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason.startsWith("lifecycle-not-pending_confirm"), true);
});

Deno.test("Test 4 — pending_confirm แต่ยังไม่มี admin/quotation evidence → NOT matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "เข้าสำรวจพื้นที่วันไหนคะ",
    recentConvs: [{ sender: "customer", message: "อยากได้ใบเสนอราคา" }],
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "no-post-quote-evidence");
});

Deno.test("Test 4b — pending_quote (ยังไม่ส่งใบเสนอราคา) → guard ไม่ทำงาน", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_quote",
    messageText: "เข้าสำรวจพื้นที่วันไหนคะ",
    recentConvs: [],
  });
  assertEquals(r.matched, false);
});

Deno.test("Test 5 — pending_confirm + evidence + 'แพ็กเกจนี้รวมอะไรบ้างคะ' → NOT matched (AI ตอบต่อได้)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "แพ็กเกจนี้รวมอะไรบ้างคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "no-pattern-match");
});

Deno.test("Test 5b — price question 'ยอดนี้รวมโต๊ะเก้าอี้ไหมคะ' → NOT matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ยอดนี้รวมโต๊ะเก้าอี้ไหมคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
});

Deno.test("Test 5c — menu question 'มีเมนูอะไรให้เลือกบ้างคะ' → NOT matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "มีเมนูอะไรให้เลือกบ้างคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
});

Deno.test("Test 6 — change request 'ขอเปลี่ยนสถานที่เป็นบางนาค่ะ' → NOT matched (AdminHandoffGuard เดิมรับผิดชอบ)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ขอเปลี่ยนสถานที่เป็นบางนาค่ะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
});

Deno.test("empty message → NOT matched", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "empty-message");
});

Deno.test("confirmed lifecycle → guard ไม่ทำงาน (ปล่อยให้ AdminHandoffGuard/CONFIRMED_MISSING_CONTEXT รับผิดชอบ)", () => {
  const r = evaluatePostQuoteNoReaskGuard({
    lifecycle: "confirmed",
    messageText: "เข้าสำรวจพื้นที่วันไหนคะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.matched, false);
});
