// Tests for resolvePhase2Gate — temporary live rollout + whitelist gating
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolvePhase2Gate } from "./ai-policy.ts";

const CUSTOMER = "df0ea919-3ef7-4334-b361-67e1a7d0602d";
const OTHER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = new Date("2026-07-03T12:00:00+07:00");
const FUTURE = "2026-07-03T17:00:00+07:00";
const PAST = "2026-07-03T09:00:00+07:00";

Deno.test("gate: flag=false → off (legacy)", () => {
  const r = resolvePhase2Gate({
    customerId: CUSTOMER,
    settings: { advanced_ai_status_policy_enabled: false, ai_policy_config: { test_customer_ids: [CUSTOMER] } },
    now: NOW,
  });
  assertEquals(r.enabled, false);
  assertEquals(r.mode, "off");
});

Deno.test("gate: flag=true + customer in whitelist → test_customer_ids", () => {
  const r = resolvePhase2Gate({
    customerId: CUSTOMER,
    settings: { advanced_ai_status_policy_enabled: true, ai_policy_config: { test_customer_ids: [CUSTOMER] } },
    now: NOW,
  });
  assertEquals(r.enabled, true);
  assertEquals(r.mode, "test_customer_ids");
});

Deno.test("gate: flag=true + live_rollout OFF + not in whitelist → off", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { test_customer_ids: [CUSTOMER], live_rollout_enabled: false, live_rollout_until: FUTURE },
    },
    now: NOW,
  });
  assertEquals(r.enabled, false);
});

Deno.test("gate: flag=true + live_rollout ON + until in future → live_rollout", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE },
    },
    now: NOW,
  });
  assertEquals(r.enabled, true);
  assertEquals(r.mode, "live_rollout");
});

Deno.test("gate: flag=true + live_rollout ON + until expired → off", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { live_rollout_enabled: true, live_rollout_until: PAST },
    },
    now: NOW,
  });
  assertEquals(r.enabled, false);
  assertEquals(r.reason, "live_rollout_expired");
});

Deno.test("gate: live_rollout_until null → off", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { live_rollout_enabled: true, live_rollout_until: null },
    },
    now: NOW,
  });
  assertEquals(r.enabled, false);
});

Deno.test("gate: live_rollout_until invalid string → off", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { live_rollout_enabled: true, live_rollout_until: "not-a-date" },
    },
    now: NOW,
  });
  assertEquals(r.enabled, false);
  assertEquals(r.reason, "live_rollout_until_invalid");
});

Deno.test("gate: kill switch — live_rollout_enabled=false stops immediately", () => {
  const r = resolvePhase2Gate({
    customerId: OTHER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { live_rollout_enabled: false, live_rollout_until: FUTURE },
    },
    now: NOW,
  });
  assertEquals(r.enabled, false);
});

Deno.test("gate: whitelist takes precedence — customer in list + live off still enabled", () => {
  const r = resolvePhase2Gate({
    customerId: CUSTOMER,
    settings: {
      advanced_ai_status_policy_enabled: true,
      ai_policy_config: { test_customer_ids: [CUSTOMER], live_rollout_enabled: false },
    },
    now: NOW,
  });
  assertEquals(r.enabled, true);
  assertEquals(r.mode, "test_customer_ids");
});
