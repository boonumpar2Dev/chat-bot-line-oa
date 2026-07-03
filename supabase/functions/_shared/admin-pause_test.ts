import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveAdminPauseMs } from "./admin-pause.ts";

const NOW = new Date("2026-07-03T10:00:00+07:00");
const FUTURE = "2026-07-03T17:00:00+07:00";
const PAST = "2026-07-03T09:00:00+07:00";

Deno.test("1. live rollout active + 3 min → live_short_pause", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE, live_admin_pause_minutes: 3 },
  }, NOW);
  assertEquals(r.mode, "live_short_pause");
  assertEquals(r.minutes, 3);
  assertEquals(r.ms, 180000);
});

Deno.test("2. live_rollout_enabled=false → legacy", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: false, live_rollout_until: FUTURE, live_admin_pause_minutes: 3 },
  }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
  assertEquals(r.ms, 360 * 3600000);
});

Deno.test("3. live_rollout_until expired → legacy", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: PAST, live_admin_pause_minutes: 3 },
  }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
});

Deno.test("4. live_admin_pause_minutes null → legacy", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE, live_admin_pause_minutes: null },
  }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
});

Deno.test("5. live_admin_pause_minutes invalid (0) → legacy", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE, live_admin_pause_minutes: 0 },
  }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
});

Deno.test("6. live_admin_pause_minutes negative → legacy", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE, live_admin_pause_minutes: -5 },
  }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
});

Deno.test("7. no ai_policy_config → legacy with default hours", () => {
  const r = resolveAdminPauseMs("c1", { manual_chat_hours: 360, ai_policy_config: null }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
  assertEquals(r.ms, 360 * 3600000);
});

Deno.test("8. missing manual_chat_hours → default 360", () => {
  const r = resolveAdminPauseMs("c1", { ai_policy_config: null }, NOW);
  assertEquals(r.mode, "legacy_long_pause");
  assertEquals(r.ms, 360 * 3600000);
});

Deno.test("9. null settings → legacy default", () => {
  const r = resolveAdminPauseMs(null, null, NOW);
  assertEquals(r.mode, "legacy_long_pause");
  assertEquals(r.ms, 360 * 3600000);
});

Deno.test("10. live rollout with 5 minute value → ms = 300000", () => {
  const r = resolveAdminPauseMs("c1", {
    manual_chat_hours: 360,
    ai_policy_config: { live_rollout_enabled: true, live_rollout_until: FUTURE, live_admin_pause_minutes: 5 },
  }, NOW);
  assertEquals(r.mode, "live_short_pause");
  assertEquals(r.ms, 300000);
});
