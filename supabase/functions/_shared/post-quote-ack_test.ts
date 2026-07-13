// Deterministic post-quote acknowledgement guard — pure function tests
// Run: supabase--test_edge_functions

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPostQuoteContext, isLowInfoAck } from "./ai-policy.ts";

// ─── isPostQuoteContext ──────────────────────────────────────────────────────

Deno.test("post-quote: status=pending_confirm → true (even with empty convs)", () => {
  assertEquals(isPostQuoteContext("pending_confirm", []), true);
});

Deno.test("post-quote: status=pending_quote → true", () => {
  assertEquals(isPostQuoteContext("pending_quote", []), true);
});

Deno.test("post-quote: status=new + no evidence → false", () => {
  assertEquals(isPostQuoteContext("new", [{ sender: "customer", message: "ขอบคุณค่ะ" }]), false);
});

Deno.test("post-quote: admin/ai mentions ใบเสนอราคา in recent 6 → true", () => {
  const convs = [
    { sender: "customer", message: "ค่ะ" },
    { sender: "admin", message: "แนบใบเสนอราคาให้ค่ะ" },
  ];
  assertEquals(isPostQuoteContext("active", convs), true);
});

Deno.test("post-quote: customer says 'ใบเสนอราคา' does NOT trigger (only admin/ai)", () => {
  const convs = [{ sender: "customer", message: "ขอใบเสนอราคาหน่อย" }];
  assertEquals(isPostQuoteContext("active", convs), false);
});

Deno.test("post-quote: admin attaches [รูปภาพ] in last 3 → true", () => {
  const convs = [
    { sender: "customer", message: "ค่ะ" },
    { sender: "admin", message: "[รูปภาพ]\n📎 https://..." },
  ];
  assertEquals(isPostQuoteContext("active", convs), true);
});

Deno.test("post-quote: admin file marker beyond 3 turns → false", () => {
  const convs = [
    { sender: "customer", message: "ok" },
    { sender: "customer", message: "hmm" },
    { sender: "customer", message: "..." },
    { sender: "admin", message: "[รูปภาพ]\n📎 https://cdn/example.jpg" },
  ];
  // admin แนบรูปเกิน 3 turns ล่าสุด และ text ไม่มีคำเกี่ยวกับใบเสนอราคา → false
  assertEquals(isPostQuoteContext("active", convs), false);
});


// ─── isLowInfoAck ────────────────────────────────────────────────────────────

Deno.test("ack: 'ขอบคุณมากค่ะ' → true", () => {
  assertEquals(isLowInfoAck("ขอบคุณมากค่ะ"), true);
});

Deno.test("ack: 'รับทราบครับ เดี๋ยวผมดูรายละเอียดครับ' → true (≤60)", () => {
  assertEquals(isLowInfoAck("รับทราบครับ เดี๋ยวผมดูรายละเอียดครับ"), true);
});

// Patch 2.5 clarification: "เดี๋ยวขอดูรายละเอียดก่อน" is a request to review details,
// not a low-info acknowledgement → production returns false (no suppression).
Deno.test("ack: 'เดี๋ยวขอดูรายละเอียดก่อน' → false (asks for time to review, not an ack)", () => {
  assertEquals(isLowInfoAck("เดี๋ยวขอดูรายละเอียดก่อน"), false);
});

Deno.test("ack: 'ค่ะ' / 'ครับ' / 'โอเค' → true", () => {
  assertEquals(isLowInfoAck("ค่ะ"), true);
  assertEquals(isLowInfoAck("ครับ"), true);
  assertEquals(isLowInfoAck("โอเค"), true);
  assertEquals(isLowInfoAck("ok"), true);
});

Deno.test("ack: sticker via messageType → true", () => {
  assertEquals(isLowInfoAck("", { messageType: "sticker" }), true);
});

Deno.test("ack: sticker via text marker → true", () => {
  assertEquals(isLowInfoAck("[สติกเกอร์]\n🎭 https://stickershop..."), true);
});

Deno.test("ack (negative): 'ยอดนี้รวมอะไรบ้างคะ' → false (question)", () => {
  assertEquals(isLowInfoAck("ยอดนี้รวมอะไรบ้างคะ"), false);
});

Deno.test("ack (negative): 'ค่าส่งเท่าไหร่คะ' → false", () => {
  assertEquals(isLowInfoAck("ค่าส่งเท่าไหร่คะ"), false);
});

Deno.test("ack (negative): 'ขอเปลี่ยนวันจัดงานเป็น 20 ก.ค. ได้ไหมคะ' → false", () => {
  assertEquals(isLowInfoAck("ขอเปลี่ยนวันจัดงานเป็น 20 ก.ค. ได้ไหมคะ"), false);
});

Deno.test("ack (negative): 'ขอแก้จำนวนคนเป็น 50 คนค่ะ' → false", () => {
  assertEquals(isLowInfoAck("ขอแก้จำนวนคนเป็น 50 คนค่ะ"), false);
});

Deno.test("ack (negative): 'ส่งใบเสนอราคาใหม่ได้ไหมคะ' → false", () => {
  assertEquals(isLowInfoAck("ส่งใบเสนอราคาใหม่ได้ไหมคะ"), false);
});

Deno.test("ack (negative): ข้อความยาว >60 → false", () => {
  const long = "ขอบคุณมากค่ะ พอดีอยากทราบว่าเมนูนี้สามารถเพิ่มของหวานอีกได้มั้ยคะ ราคาจะเปลี่ยนไหมคะ";
  assertEquals(isLowInfoAck(long), false);
});

Deno.test("ack (negative): empty → false", () => {
  assertEquals(isLowInfoAck(""), false);
  assertEquals(isLowInfoAck(null), false);
});

// ─── Combined behaviour (guard truth-table) ─────────────────────────────────

function shouldSuppress(
  status: string,
  convs: any[],
  text: string,
  msgType?: string,
): boolean {
  return isPostQuoteContext(status, convs) && isLowInfoAck(text, { messageType: msgType });
}

Deno.test("guard #1: pending_confirm + ขอบคุณมากค่ะ → suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "ขอบคุณมากค่ะ"), true);
});

Deno.test("guard #2: pending_confirm + รับทราบครับ เดี๋ยวผมดูรายละเอียดครับ → suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "รับทราบครับ เดี๋ยวผมดูรายละเอียดครับ"), true);
});

Deno.test("guard #3: pending_confirm + sticker → suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "", "sticker"), true);
});

Deno.test("guard #4: pending_confirm + เดี๋ยวขอดูรายละเอียดก่อน → suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "เดี๋ยวขอดูรายละเอียดก่อน"), true);
});

Deno.test("guard #5: pending_confirm + ยอดนี้รวมอะไรบ้างคะ → NOT suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "ยอดนี้รวมอะไรบ้างคะ"), false);
});

Deno.test("guard #6: new + no quote evidence + ขอบคุณค่ะ → NOT suppress", () => {
  assertEquals(shouldSuppress("new", [{ sender: "customer", message: "ขอบคุณค่ะ" }], "ขอบคุณค่ะ"), false);
});

Deno.test("guard #7: active + admin ส่งใบเสนอราคา + ลูกค้า ค่ะ → suppress", () => {
  const convs = [
    { sender: "customer", message: "ค่ะ" },
    { sender: "admin", message: "แนบใบเสนอราคาให้ค่ะ" },
  ];
  assertEquals(shouldSuppress("active", convs, "ค่ะ"), true);
});

Deno.test("guard #8: pending_confirm + ขอเปลี่ยนวันจัดงาน → NOT suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "ขอเปลี่ยนวันจัดงานเป็น 20 ก.ค. ได้ไหมคะ"), false);
});

Deno.test("guard #9: pending_confirm + ขอแก้จำนวนคน → NOT suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "ขอแก้จำนวนคนเป็น 50 คนค่ะ"), false);
});

Deno.test("guard #10: pending_confirm + ค่าส่งเท่าไหร่ → NOT suppress", () => {
  assertEquals(shouldSuppress("pending_confirm", [], "ค่าส่งเท่าไหร่คะ"), false);
});

Deno.test("guard #11 (regression): pending_quote + ขอบคุณค่ะ → suppress", () => {
  assertEquals(shouldSuppress("pending_quote", [], "ขอบคุณค่ะ"), true);
});

Deno.test("guard #12 (regression): status=confirmed (post-quote) + ครับ → suppress via admin marker", () => {
  const convs = [
    { sender: "admin", message: "[รูปภาพ]\n📎 https://..." },
  ];
  assertEquals(shouldSuppress("confirmed", convs, "ครับ"), true);
});
