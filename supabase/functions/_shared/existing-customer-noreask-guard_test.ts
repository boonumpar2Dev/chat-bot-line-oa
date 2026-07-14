// Phase 2A.1 tests — Existing Customer No-Reask Guard
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateExistingCustomerNoReaskGuard,
  detectIsExistingCustomer,
  detectIsNewCycle,
} from "./existing-customer-noreask-guard.ts";

const REPLY =
  "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดที่คุยไว้และประสานกลับนะคะ 🙏";

const adminHistory = [
  { sender: "customer", message: "สนใจจัดงานค่ะ" },
  { sender: "admin", message: "ขอสอบถามจำนวนแขกค่ะ" },
];

// ── Test 1: pending_confirm + "พี่เคยบอกแล้วนะคะ" → matched ─────────────
Deno.test("Test 1 — existing customer says 'พี่เคยบอกแล้วนะคะ' → matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "พี่เคยบอกแล้วนะคะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
  assertEquals(r.replyText, REPLY);
  assertEquals(r.isExistingCustomer, true);
});

// ── Test 2: confirmed + "แจ้งรายละเอียดไว้ก่อนหน้านี้แล้วค่ะ" → matched
Deno.test("Test 2 — confirmed customer 'แจ้งรายละเอียดไว้ก่อนหน้านี้แล้ว' → matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "confirmed",
    messageText: "แจ้งรายละเอียดไว้ก่อนหน้านี้แล้วค่ะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
});

// ── Test 3: existing customer asks focused site-visit question → NOT matched
Deno.test("Test 3 — 'ทีมจะเข้ามาดูพื้นที่วันไหนคะ' → NOT matched (PostQuoteNoReask handles)", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ทีมจะเข้ามาดูพื้นที่วันไหนคะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "no-pattern-match");
});

// ── Test 4: existing customer asks package question → NOT matched
Deno.test("Test 4 — package question 'แพ็กเกจนี้รวมอะไรบ้างคะ' → NOT matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "แพ็กเกจนี้รวมอะไรบ้างคะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, false);
});

// ── Test 5: new customer says "สนใจจัดงานค่ะ" → NOT matched (guard skips)
Deno.test("Test 5 — new customer 'สนใจจัดงานค่ะ' → NOT matched (not-existing)", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "new",
    messageText: "สนใจจัดงานค่ะ",
    recentConvs: [],
    facts: null,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "not-existing-customer");
});

// ── Test 5b: even "เคยบอกแล้ว" on new customer with no signals → NOT matched
Deno.test("Test 5b — new customer + 'เคยบอกแล้ว' + no history → NOT matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "new",
    messageText: "เคยบอกแล้วค่ะ",
    recentConvs: [],
    facts: null,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "not-existing-customer");
});

// ── Test 6: existing customer starts new cycle → NOT matched (skip)
Deno.test("Test 6 — 'ขอสอบถามงานใหม่ค่ะ' → NOT matched (new-cycle)", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "completed",
    messageText: "ขอสอบถามงานใหม่ค่ะ",
    recentConvs: adminHistory,
    facts: { phone: "0812345678" },
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "new-cycle-detected");
  assertEquals(r.isNewCycle, true);
});

Deno.test("Test 6b — 'มีงานใหม่ค่ะ' → new-cycle skip", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "returning",
    messageText: "มีงานใหม่ค่ะ ครั้งนี้จัดที่บางนา",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "new-cycle-detected");
});

// ── Test 7: "เคยบอกแล้ว" but no structured data → still handoff (existing via history)
Deno.test("Test 7 — 'เคยบอกแล้ว' with admin history but no structured data → matched (handoff, no data claim)", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "เคยบอกไปแล้วนะคะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
  assertEquals(r.replyText, REPLY);
  // Reply must NOT claim system has the data
  assertEquals(r.replyText.includes("ตามที่เราเคยคุย"), false);
});

// ── Existing detection: status=new but has admin history → existing
Deno.test("detectIsExistingCustomer — status=new + admin history → true", () => {
  const r = detectIsExistingCustomer({
    lifecycle: "new",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r, true);
});

// ── Existing detection: structured data alone → existing
Deno.test("detectIsExistingCustomer — status=new + facts.phone → true", () => {
  const r = detectIsExistingCustomer({
    lifecycle: "new",
    recentConvs: [],
    facts: { phone: "0812345678" },
  });
  assertEquals(r, true);
});

// ── Existing detection: nothing → not existing
Deno.test("detectIsExistingCustomer — status=new + no history + no facts → false", () => {
  const r = detectIsExistingCustomer({
    lifecycle: "new",
    recentConvs: [],
    facts: null,
  });
  assertEquals(r, false);
});

// ── New cycle detector — positive cases
Deno.test("detectIsNewCycle — 'ขอราคาอีกงาน' → true", () => {
  assertEquals(detectIsNewCycle("ขอราคาอีกงานค่ะ"), true);
});
Deno.test("detectIsNewCycle — 'งานรอบใหม่' → true", () => {
  assertEquals(detectIsNewCycle("งานรอบใหม่ค่ะ"), true);
});
Deno.test("detectIsNewCycle — 'ครั้งนี้จัดที่ระยอง' → true", () => {
  assertEquals(detectIsNewCycle("ครั้งนี้จัดที่ระยองค่ะ"), true);
});
Deno.test("detectIsNewCycle — normal message → false", () => {
  assertEquals(detectIsNewCycle("เคยบอกไปแล้วนะคะ"), false);
});

// ── Empty message
Deno.test("empty message → NOT matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, false);
  assertEquals(r.reason, "empty-message");
});

// ── Extra "ตามที่คุยกัน" phrasing
Deno.test("'ตามที่คุยกันไว้ค่ะ' → matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "confirmed",
    messageText: "ตามที่คุยกันไว้ค่ะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
});

// ── "ข้อมูลเดิมค่ะ" → matched
Deno.test("'ข้อมูลเดิมค่ะ' → matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "pending_confirm",
    messageText: "ข้อมูลเดิมค่ะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
});

// ── "แอดมินมีข้อมูลแล้ว" → matched
Deno.test("'แอดมินมีข้อมูลแล้วค่ะ' → matched", () => {
  const r = evaluateExistingCustomerNoReaskGuard({
    lifecycle: "confirmed",
    messageText: "แอดมินมีข้อมูลแล้วค่ะ",
    recentConvs: adminHistory,
    facts: null,
  });
  assertEquals(r.matched, true);
});
