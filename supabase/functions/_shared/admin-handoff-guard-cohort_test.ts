// Patch 2.9.1 — Containment tests
// Verify AdminHandoffGuard is gated by the Phase 2 policy cohort
// (test_customer_ids / live_rollout). The gate itself is resolvePhase2Gate;
// the call-site in line-webhook only runs the guard when gate.enabled=true.
//
// Test A — Natcha (in test_customer_ids) → gate enabled → guard runs
// Test B — Non-cohort customer + rollout=false → gate DISABLED → guard MUST be skipped
// Test C — admin_handoff_guard.enabled=false → guard evaluator returns matched=false

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolvePhase2Gate } from "./ai-policy.ts";
import { evaluateAdminHandoffGuard } from "./admin-handoff-guard.ts";

const NATCHA = "df0ea919-3ef7-4334-b361-67e1a7d0602d";
const OTHER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = new Date("2026-07-13T12:00:00+07:00");

// Mirrors production DB state at containment time:
//   advanced_ai_status_policy_enabled=true, test_customer_ids=[NATCHA],
//   live_rollout_enabled=false, live_rollout_until=<past>
const PROD_SETTINGS = {
  advanced_ai_status_policy_enabled: true,
  ai_policy_config: {
    test_customer_ids: [NATCHA],
    live_rollout_enabled: false,
    live_rollout_until: "2026-07-08T23:59:00+07:00",
  },
};

Deno.test("Test A — Natcha in cohort → gate enabled → guard would run", () => {
  const gate = resolvePhase2Gate({ customerId: NATCHA, settings: PROD_SETTINGS, now: NOW });
  assertEquals(gate.enabled, true);
  assertEquals(gate.mode, "test_customer_ids");

  const g = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่จัดงานเป็นบางนาค่ะ",
  });
  assertEquals(g.matched, true);
});

Deno.test("Test B — other customer + rollout=false → gate DISABLED (containment)", () => {
  const gate = resolvePhase2Gate({ customerId: OTHER, settings: PROD_SETTINGS, now: NOW });
  assertEquals(gate.enabled, false);
  // Call-site MUST skip guard entirely when gate.enabled=false — do NOT even
  // evaluate patterns. This test documents that expectation.
});

Deno.test("Test B.2 — other customer + rollout=true still until expired → gate DISABLED", () => {
  const gate = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: {
        test_customer_ids: [NATCHA],
        live_rollout_enabled: true,
        live_rollout_until: "2026-07-08T23:59:00+07:00", // past
      },
    },
    now: NOW,
  });
  assertEquals(gate.enabled, false);
});

Deno.test("Test C — config enabled=false → guard evaluator returns matched=false", () => {
  const g = evaluateAdminHandoffGuard({
    lifecycle: "confirmed",
    messageText: "ขอเปลี่ยนสถานที่จัดงานเป็นบางนาค่ะ",
    config: { enabled: false },
  });
  assertEquals(g.matched, false);
  assertEquals(g.reason, "disabled");
});

Deno.test("Test D — advanced_ai_status_policy_enabled=false → gate DISABLED even for Natcha", () => {
  const gate = resolvePhase2Gate({
    customerId: NATCHA,
    settings: {
      advanced_ai_status_policy_enabled: false,
      ai_policy_config: { test_customer_ids: [NATCHA] },
    },
    now: NOW,
  });
  assertEquals(gate.enabled, false);
});
