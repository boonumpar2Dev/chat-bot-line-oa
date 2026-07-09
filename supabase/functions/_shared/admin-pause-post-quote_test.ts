// Tests for admin-pause short-pause behavior in post-quote statuses (Patch 1 - A)
// The logic is inline in line-send-message; we replicate the decision function here
// to lock behavior via a pure test.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Status = "pending_confirm" | "confirmed" | "confirmed_returning" | "new" | "pending_quote" | null;

function computeAdminPauseForStatus(
  status: Status,
  pauseSettings: { ai_policy_config?: { live_admin_pause_minutes?: number | null } | null } | null,
  legacyMs: number,
): { manual_chat_until_minutes: number; disable_ai: boolean; source: "config" | "fallback" | "legacy" } {
  const isPost = status === "pending_confirm" || status === "confirmed" || status === "confirmed_returning";
  if (isPost) {
    const raw = pauseSettings?.ai_policy_config?.live_admin_pause_minutes;
    const min = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 3;
    return { manual_chat_until_minutes: min, disable_ai: false, source: typeof raw === "number" && raw > 0 ? "config" : "fallback" };
  }
  return { manual_chat_until_minutes: Math.round(legacyMs / 60000), disable_ai: true, source: "legacy" };
}

Deno.test("pending_confirm + no config → 3 min fallback, ai NOT disabled", () => {
  const r = computeAdminPauseForStatus("pending_confirm", { ai_policy_config: null }, 360 * 3600000);
  assertEquals(r.manual_chat_until_minutes, 3);
  assertEquals(r.disable_ai, false);
  assertEquals(r.source, "fallback");
});

Deno.test("confirmed + config 3 → 3 min from config, ai NOT disabled", () => {
  const r = computeAdminPauseForStatus("confirmed", { ai_policy_config: { live_admin_pause_minutes: 3 } }, 360 * 3600000);
  assertEquals(r.manual_chat_until_minutes, 3);
  assertEquals(r.disable_ai, false);
  assertEquals(r.source, "config");
});

Deno.test("confirmed_returning + config 5 → 5 min, ai NOT disabled", () => {
  const r = computeAdminPauseForStatus("confirmed_returning", { ai_policy_config: { live_admin_pause_minutes: 5 } }, 360 * 3600000);
  assertEquals(r.manual_chat_until_minutes, 5);
  assertEquals(r.disable_ai, false);
});

Deno.test("new status → legacy long pause + ai disabled", () => {
  const r = computeAdminPauseForStatus("new", { ai_policy_config: null }, 360 * 3600000);
  assertEquals(r.disable_ai, true);
  assertEquals(r.source, "legacy");
  assertEquals(r.manual_chat_until_minutes, 360 * 60);
});

Deno.test("pending_quote → legacy long pause + ai disabled (post-quote statuses only)", () => {
  const r = computeAdminPauseForStatus("pending_quote", { ai_policy_config: null }, 360 * 3600000);
  assertEquals(r.disable_ai, true);
});

Deno.test("post-quote never disables AI permanently", () => {
  for (const s of ["pending_confirm", "confirmed", "confirmed_returning"] as Status[]) {
    const r = computeAdminPauseForStatus(s, null, 360 * 3600000);
    assertEquals(r.disable_ai, false, `status=${s} should not disable AI`);
    assertEquals(r.manual_chat_until_minutes < 60, true, `status=${s} pause should be short (<60min), got ${r.manual_chat_until_minutes}`);
  }
});
