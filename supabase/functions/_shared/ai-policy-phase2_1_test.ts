// Phase 2.1 tests — CURRENT_CUSTOMER_CONTEXT block
// Guarantees:
//   1. Pure — no I/O, no side effects
//   2. Merge rule — columns primary, intent_data fills gaps only
//   3. fieldNames returns keys only (never values) — safe to log
//   4. Gating (via buildPrompt) — flag=false / policyEnabled=false / empty block = no-op
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCurrentCustomerContextBlock } from "./ai-policy.ts";
import { buildPrompt } from "./prompt-builder.ts";

Deno.test("phase2.1: empty inputs → empty block", () => {
  const r = buildCurrentCustomerContextBlock(null, null);
  assertEquals(r.block, "");
  assertEquals(r.fieldNames, []);
});

Deno.test("phase2.1: columns only render in Thai labels + correct order", () => {
  const r = buildCurrentCustomerContextBlock(
    { event_type: "ทำบุญบ้าน", guest_count: 50, venue: "บ้านลาดพร้าว 71", event_date: "2026-07-20" },
    null,
  );
  assert(r.block.includes("ประเภทงาน: ทำบุญบ้าน"));
  assert(r.block.includes("วันจัดงาน: 2026-07-20"));
  assert(r.block.includes("จำนวนคน: 50"));
  assert(r.block.includes("สถานที่: บ้านลาดพร้าว 71"));
  assertEquals(r.fieldNames, ["event_type", "event_date", "guest_count", "venue"]);
});

Deno.test("phase2.1: intent_data fills gaps only — columns take priority", () => {
  const r = buildCurrentCustomerContextBlock(
    { event_type: "ทำบุญบ้าน" },
    { event_type: "ทำบุญ" /* should be IGNORED */, service_type: "บุฟเฟ่ต์" },
  );
  assert(r.block.includes("ประเภทงาน: ทำบุญบ้าน"));
  assert(!r.block.includes("ทำบุญ\n"), "intent_data.event_type must not override columns");
  assert(r.block.includes("service_type: บุฟเฟ่ต์"));
  assertEquals(r.fieldNames, ["event_type", "service_type"]);
});

Deno.test("phase2.1: service_type from intent_data appears in block", () => {
  const r = buildCurrentCustomerContextBlock(null, { service_type: "บุฟเฟ่ต์" });
  assert(r.block.includes("service_type: บุฟเฟ่ต์"));
  assert(r.fieldNames.includes("service_type"));
});

Deno.test("phase2.1: skips blank/null/whitespace values", () => {
  const r = buildCurrentCustomerContextBlock(
    { event_type: "", venue: null as any, guest_count: "   " as any },
    { extra: "  " },
  );
  assertEquals(r.block, "");
  assertEquals(r.fieldNames, []);
});

Deno.test("phase2.1: skips reserved keys (venue_location, _pilot_marker)", () => {
  const r = buildCurrentCustomerContextBlock(null, {
    venue_location: { lat: 1, lng: 2 },
    _pilot_marker: "TEST",
    service_type: "บุฟเฟ่ต์",
  });
  assert(!r.block.includes("venue_location"));
  assert(!r.block.includes("_pilot_marker"));
  assert(!r.block.includes("PILOT_TEST_"));
  assertEquals(r.fieldNames, ["service_type"]);
});

Deno.test("phase2.1: skips complex object values from intent_data", () => {
  const r = buildCurrentCustomerContextBlock(null, {
    some_obj: { nested: true },
    plain: "ok",
  });
  assert(r.block.includes("plain: ok"));
  assert(!r.block.includes("some_obj"));
});

Deno.test("phase2.1: block contains required rules (no repeat, multi-intent, high-risk)", () => {
  const r = buildCurrentCustomerContextBlock({ event_type: "ทำบุญ" }, null);
  assert(r.block.includes("ห้ามถามซ้ำ"), "must contain no-repeat rule");
  assert(r.block.includes("ตอบทีละประเด็น"), "must contain multi-intent rule");
  assert(r.block.includes("[GUARDRAIL]"), "must reference guardrail");
  assert(r.block.includes("ห้ามวนถามเรื่องเดิมซ้ำ"), "must contain no-loop rule");
});

Deno.test("phase2.1: fieldNames never leaks values", () => {
  const r = buildCurrentCustomerContextBlock(
    { phone: "0891234567", event_type: "ทำบุญ" },
    { service_type: "บุฟเฟ่ต์" },
  );
  for (const name of r.fieldNames) {
    assert(!name.includes("0891"), "fieldNames must not contain phone value");
    assert(!name.includes("บุฟเฟ่ต์"), "fieldNames must not contain intent value");
    assert(!name.includes("ทำบุญ"), "fieldNames must not contain event value");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPrompt gating tests
// ─────────────────────────────────────────────────────────────────────────────

const baseInput = {
  cfg: { ai_persona: "TEST_PERSONA", strict_rules: [] },
  kbContext: "kb",
  pkgContext: "pkg",
  promoContext: "promo",
  imageListStr: "",
  recentMsgs: "",
  messageText: "hello",
};

Deno.test("phase2.1 gate: policyEnabled=undefined → no context inject", () => {
  const r = buildPrompt({
    ...baseInput,
    customerContextBlock: "[CURRENT_CUSTOMER_CONTEXT] should NOT appear",
  });
  assert(!r.systemPrompt.includes("[CURRENT_CUSTOMER_CONTEXT]"));
});

Deno.test("phase2.1 gate: policyEnabled=false → no context inject", () => {
  const r = buildPrompt({
    ...baseInput,
    policyEnabled: false,
    customerContextBlock: "[CURRENT_CUSTOMER_CONTEXT] should NOT appear",
  });
  assert(!r.systemPrompt.includes("[CURRENT_CUSTOMER_CONTEXT]"));
});

Deno.test("phase2.1 gate: policyEnabled=true but empty block → no context inject", () => {
  const r = buildPrompt({
    ...baseInput,
    policyEnabled: true,
    customerContextBlock: "",
  });
  assert(!r.systemPrompt.includes("[CURRENT_CUSTOMER_CONTEXT]"));
});

Deno.test("phase2.1 gate: policyEnabled=true + block present → injected", () => {
  const ctx = buildCurrentCustomerContextBlock(
    { event_type: "ทำบุญบ้าน" },
    { service_type: "บุฟเฟ่ต์" },
  );
  const r = buildPrompt({
    ...baseInput,
    policyEnabled: true,
    customerContextBlock: ctx.block,
  });
  assert(r.systemPrompt.includes("[CURRENT_CUSTOMER_CONTEXT]"));
  assert(r.systemPrompt.includes("ประเภทงาน: ทำบุญบ้าน"));
  assert(r.systemPrompt.includes("service_type: บุฟเฟ่ต์"));
});

Deno.test("phase2.1 baseline: no phase2 fields → prompt is byte-identical to pre-phase2", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, policyEnabled: false, customerContextBlock: "anything" });
  assertEquals(a.systemPrompt, b.systemPrompt);
  assertEquals(a.userPrompt, b.userPrompt);
});
