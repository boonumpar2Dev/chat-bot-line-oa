// Patch 2.9 — buildConfirmedMissingContextBlock tests
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmedMissingContextBlock } from "./ai-policy.ts";

Deno.test("returns empty when lifecycle != confirmed", () => {
  assertEquals(buildConfirmedMissingContextBlock("pending_confirm", { event_date: null, venue: null }), "");
  assertEquals(buildConfirmedMissingContextBlock("new", { event_date: null, venue: null }), "");
  assertEquals(buildConfirmedMissingContextBlock("completed_recent", { event_date: null, venue: null }), "");
  assertEquals(buildConfirmedMissingContextBlock(undefined, { event_date: null, venue: null }), "");
});

Deno.test("returns empty when confirmed + both event_date and venue present", () => {
  const b = buildConfirmedMissingContextBlock("confirmed", { event_date: "2026-08-01", venue: "ลาดพร้าว" });
  assertEquals(b, "");
});

Deno.test("returns block when confirmed + missing event_date", () => {
  const b = buildConfirmedMissingContextBlock("confirmed", { event_date: null, venue: "ลาดพร้าว" });
  assert(b.includes("[CONFIRMED_MISSING_CONTEXT]"));
  assert(b.includes("วันจัดงาน"));
  assert(!b.includes("สถานที่จัดงาน"));
});

Deno.test("returns block when confirmed + missing venue", () => {
  const b = buildConfirmedMissingContextBlock("confirmed", { event_date: "2026-08-01", venue: "" });
  assert(b.includes("[CONFIRMED_MISSING_CONTEXT]"));
  assert(b.includes("สถานที่จัดงาน"));
});

Deno.test("returns block when confirmed + both missing (real Natcha case)", () => {
  const b = buildConfirmedMissingContextBlock("confirmed", { event_date: null, venue: null });
  assert(b.includes("[CONFIRMED_MISSING_CONTEXT]"));
  assert(b.includes("วันจัดงาน"));
  assert(b.includes("สถานที่จัดงาน"));
  assert(b.includes("ห้ามถามใหม่"));
  assert(b.includes("แอดมินตรวจสอบรายละเอียดงานที่คอนเฟิร์ม"));
});

Deno.test("does not include hardcoded date/venue/guest/price/package data", () => {
  const b = buildConfirmedMissingContextBlock("confirmed", { event_date: null, venue: null });
  // no specific dates, prices, package names, guest counts
  assert(!/\d{4}-\d{2}-\d{2}/.test(b), "must not contain any date");
  assert(!/\b\d{1,3},?\d{3}\b/.test(b), "must not contain any price");
  assert(!b.includes("ลาดพร้าว"));
  assert(!b.includes("บางนา"));
});

Deno.test("handles null/undefined cols gracefully", () => {
  const b1 = buildConfirmedMissingContextBlock("confirmed", null);
  const b2 = buildConfirmedMissingContextBlock("confirmed", undefined);
  assert(b1.includes("[CONFIRMED_MISSING_CONTEXT]"));
  assert(b2.includes("[CONFIRMED_MISSING_CONTEXT]"));
});
