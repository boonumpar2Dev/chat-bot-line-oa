// Patch 2.9.1 — Tests for resolveAdminHandoffDecision.
// Locks the behavior contract identical to the two legacy call-sites in
// line-webhook: admin_bot_override=true → skip ai_active flip; otherwise disable.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveAdminHandoffDecision } from "./admin-handoff.ts";

Deno.test("handover_promise: override=true → keep AI on", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: true, reason: "handover_promise" });
  assertEquals(r.disableAi, false);
});

Deno.test("handover_promise: override=false → disable AI", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: false, reason: "handover_promise" });
  assertEquals(r.disableAi, true);
});

Deno.test("handover_promise: override=null → disable AI (legacy default)", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: null, reason: "handover_promise" });
  assertEquals(r.disableAi, true);
});

Deno.test("handover_promise: override=undefined → disable AI (legacy default)", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: undefined, reason: "handover_promise" });
  assertEquals(r.disableAi, true);
});

Deno.test("confirm_existing_phone: override=true → keep AI on", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: true, reason: "confirm_existing_phone" });
  assertEquals(r.disableAi, false);
});

Deno.test("confirm_existing_phone: override=false → disable AI", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: false, reason: "confirm_existing_phone" });
  assertEquals(r.disableAi, true);
});

Deno.test("confirm_existing_phone: override=null → disable AI", () => {
  const r = resolveAdminHandoffDecision({ adminBotOverride: null, reason: "confirm_existing_phone" });
  assertEquals(r.disableAi, true);
});

Deno.test("logMessage tags reason distinctly (handover vs confirm)", () => {
  const a = resolveAdminHandoffDecision({ adminBotOverride: true, reason: "handover_promise" });
  const b = resolveAdminHandoffDecision({ adminBotOverride: true, reason: "confirm_existing_phone" });
  assertEquals(a.logMessage.includes("Handover"), true);
  assertEquals(b.logMessage.includes("ConfirmPhone"), true);
});

Deno.test("truthy non-boolean is NOT treated as override (strict === true)", () => {
  // Guards against accidental widening: only strict boolean true opts out of disable.
  const r = resolveAdminHandoffDecision({ adminBotOverride: 1 as unknown as boolean, reason: "handover_promise" });
  assertEquals(r.disableAi, true);
});
