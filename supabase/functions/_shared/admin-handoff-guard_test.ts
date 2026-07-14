// Patch 2.9.1 — Tests for AdminHandoffGuard.
// Covers the 9 Controlled Test scenarios in the patch spec:
//   1 Confirmed missing schedule       → verify reply, matched
//   2 Change venue                      → standard reply, matched
//   3 Change guest count                → standard reply, matched
//   4 Document change                   → standard reply, matched
//   5 Payment verification              → verify reply, matched
//   6 Grounded question                 → skip (not matched)
//   7 New-customer lead                 → skip (lifecycle allow-list)
//   8 Override regression (new)         → matched still forces disable in caller;
//                                         guard.matched=true regardless of override
//                                         (override handled by resolveAdminHandoffDecision)
//   9 Legacy override regression        → tested in admin-handoff_test.ts (unchanged)

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateAdminHandoffGuard,
  __ADMIN_HANDOFF_GUARD_DEFAULTS,
} from "./admin-handoff-guard.ts";
import { resolveAdminHandoffDecision } from "./admin-handoff.ts";

const GENERAL = __ADMIN_HANDOFF_GUARD_DEFAULTS.replyGeneral;
const SCHEDULE = __ADMIN_HANDOFF_GUARD_DEFAULTS.replySchedule;
const MENU = __ADMIN_HANDOFF_GUARD_DEFAULTS.replyMenu;
const VERIFY = __ADMIN_HANDOFF_GUARD_DEFAULTS.replyVerify;
// Legacy alias kept for tests that assert change_request→general fell to STANDARD.
const STANDARD = __ADMIN_HANDOFF_GUARD_DEFAULTS.replyStandard;

// ── Positive matches ─────────────────────────────────────────────────

Deno.test("Test 1 — confirmed: team site-visit question → verify reply", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "เลือกรายการอาหารเมื่อไหร่ครับ แล้วทีมจะเข้ามาดูพื้นที่วันไหน",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "confirmed_missing_context");
  assertEquals(r.replyText, VERIFY);
});

Deno.test("Test 2 — confirmed: change venue → standard reply", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่จัดงานเป็นบางนาค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "change_request");
  assertEquals(r.replyText, STANDARD);
  // must NOT echo the customer's detail ("บางนา")
  assert(!r.replyText.includes("บางนา"));
});

Deno.test("Test 3 — confirmed: change guest count → standard reply", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเพิ่มจำนวนแขกเป็น 60 คนค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "change_request");
  assertEquals(r.replyText, STANDARD);
  assert(!r.replyText.includes("60"));
});

Deno.test("Test 4 — confirmed: doc change → standard reply", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "รบกวนแก้ชื่อในใบเสนอราคาให้หน่อยค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "change_request");
  assertEquals(r.replyText, STANDARD);
});

Deno.test("Test 5 — confirmed: payment verification → verify reply", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "โอนมัดจำแล้ว ช่วยเช็กยอดให้หน่อยค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "payment_verify");
  assertEquals(r.replyText, VERIFY);
});

Deno.test("pending_confirm: change request also matched", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "pending_confirm",
    messageText: "ขอเลื่อนวันจัดงานค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "change_request");
});

Deno.test("confirmed_returning: staff action matched", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed_returning",
    messageText: "รบกวนขอใบกำกับภาษีด้วยค่ะ",
  });
  assertEquals(r.matched, true);
  assertEquals(r.category, "staff_action");
});

// ── Negative: must NOT match ────────────────────────────────────────

Deno.test("Test 6 — grounded question: package contents → skip", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "แพ็กเกจนี้รวมอะไรบ้างคะ",
  });
  assertEquals(r.matched, false);
});

Deno.test("Test 7 — new-customer lead → skip via lifecycle allow-list", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "new",
    messageText: "สนใจจัดงานบุญค่ะ",
  });
  assertEquals(r.matched, false);
  assert(r.reason.startsWith("lifecycle-not-allowed"));
});

Deno.test("pending_quote lifecycle → skip (not in allow-list)", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "pending_quote",
    messageText: "ขอเปลี่ยนสถานที่ค่ะ",
  });
  assertEquals(r.matched, false);
});

Deno.test("empty / null lifecycle → skip", () => {
  const a = evaluateAdminHandoffGuard({ lifecycle: null, messageText: "ขอเปลี่ยนสถานที่" });
  const b = evaluateAdminHandoffGuard({ lifecycle: "", messageText: "ขอเปลี่ยนสถานที่" });
  assertEquals(a.matched, false);
  assertEquals(b.matched, false);
});

Deno.test("empty message → skip", () => {
  const r = evaluateAdminHandoffGuard({ lifecycle: "confirmed", messageText: "  " });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "empty-message");
});

Deno.test("disabled config → skip", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่",
    config: { enabled: false },
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "disabled");
});

// ── Config overrides ─────────────────────────────────────────────────

Deno.test("custom allowed_lifecycles config", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "custom_state",
    messageText: "ขอเปลี่ยนสถานที่",
    config: { allowed_lifecycles: ["custom_state"] },
  });
  assertEquals(r.matched, true);
});

Deno.test("custom reply texts from config", () => {
  const r = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่",
    config: { reply_standard: "รอสักครู่นะคะ 🙏" },
  });
  assertEquals(r.matched, true);
  assertEquals(r.replyText, "รอสักครู่นะคะ 🙏");
});

// ── Test 8: override regression (new) — force disable ────────────────

Deno.test("Test 8 — confirmed + override=true + change request → force disableAi", () => {
  const guard = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่จัดงานเป็นบางนาค่ะ",
  });
  assertEquals(guard.matched, true);
  // Decision with admin_bot_override=true MUST still disable AI
  const decision = resolveAdminHandoffDecision({
    adminBotOverride: true,
    reason: "admin_handoff_guard",
  });
  assertEquals(decision.disableAi, true);
  assertEquals(decision.overrideRespected, false);
});

Deno.test("admin_handoff_guard: override=false also disables AI", () => {
  const decision = resolveAdminHandoffDecision({
    adminBotOverride: false,
    reason: "admin_handoff_guard",
  });
  assertEquals(decision.disableAi, true);
});

Deno.test("admin_handoff_guard: override=null also disables AI", () => {
  const decision = resolveAdminHandoffDecision({
    adminBotOverride: null,
    reason: "admin_handoff_guard",
  });
  assertEquals(decision.disableAi, true);
});

// ── Reply guarantees ─────────────────────────────────────────────────

Deno.test("replies contain no question marks (must not ask questions)", () => {
  for (const text of [STANDARD, VERIFY]) {
    assert(!/[?？]/.test(text), `reply must not contain '?': ${text}`);
    assert(!text.includes("ไหม"), `reply must not ask 'ไหม': ${text}`);
    assert(!text.includes("มั้ย"), `reply must not ask 'มั้ย': ${text}`);
  }
});

Deno.test("replies do not claim completion ('เรียบร้อยแล้ว')", () => {
  for (const text of [STANDARD, VERIFY]) {
    assert(!text.includes("เรียบร้อยแล้ว"), `reply must not claim done: ${text}`);
    assert(!text.includes("ดำเนินการเสร็จ"), `reply must not claim done: ${text}`);
  }
});
