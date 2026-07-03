// Deno tests — Phase 2: lifecycle resolver + prompt-builder integration
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveLifecycle, buildLifecycleBlock, buildGuardrailBlock } from "./ai-policy.ts";
import { buildPrompt, type BuildPromptInput } from "./prompt-builder.ts";

const NOW = new Date("2026-07-02T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

// ── Lifecycle resolver ───────────────────────────────────────────────────────

Deno.test("lifecycle: pending_confirm status", () => {
  const r = resolveLifecycle({ customer: { status: "pending_confirm" }, now: NOW });
  assertEquals(r.lifecycle, "pending_confirm");
  assertEquals(r.replyMode, "care_mode");
});

Deno.test("lifecycle: confirmed status", () => {
  const r = resolveLifecycle({ customer: { status: "confirmed" }, now: NOW });
  assertEquals(r.lifecycle, "confirmed");
});

Deno.test("lifecycle: postponed status", () => {
  const r = resolveLifecycle({ customer: { status: "postponed" }, now: NOW });
  assertEquals(r.lifecycle, "postponed");
});

Deno.test("lifecycle: new status → new lifecycle", () => {
  const r = resolveLifecycle({ customer: { status: "new" }, now: NOW });
  assertEquals(r.lifecycle, "new");
  assertEquals(r.replyMode, "new_customer");
});

Deno.test("lifecycle: completed + 30 days exact → completed_recent", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(30),
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_recent");
});

Deno.test("lifecycle: completed + 31 days → completed_warm", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(31),
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_warm");
});

Deno.test("lifecycle: completed + 90 days exact → completed_warm", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(90),
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_warm");
});

Deno.test("lifecycle: completed + 91 days → completed_old", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(91),
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_old");
});

Deno.test("lifecycle: completed but no date → completed_unknown", () => {
  const r = resolveLifecycle({ customer: { status: "completed" }, now: NOW });
  assertEquals(r.lifecycle, "completed_unknown");
});

Deno.test("lifecycle: date fallback — event_date > status_log > updated_at", () => {
  const r = resolveLifecycle({
    customer: { status: "completed", updated_at: daysAgo(200) },
    latestCompletedEventDate: null,
    latestCompletedStatusChangedAt: daysAgo(10),
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_recent");
});

Deno.test("lifecycle: falls back to updated_at when both null", () => {
  const r = resolveLifecycle({
    customer: { status: "completed", updated_at: daysAgo(50) },
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_warm");
});

Deno.test("lifecycle: configurable thresholds via ai_policy_config", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(20),
    config: { completed_recent_days: 10, completed_warm_days: 30 },
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_warm");
});

Deno.test("lifecycle: malformed thresholds → fallback to defaults 30/90", () => {
  const r = resolveLifecycle({
    customer: { status: "completed" },
    latestCompletedEventDate: daysAgo(25),
    config: { completed_recent_days: "bogus", completed_warm_days: -5 },
    now: NOW,
  });
  assertEquals(r.lifecycle, "completed_recent");
});

// ── Guardrail wording matches handover regex ─────────────────────────────────

const handoverPatterns = /ขอ(ส่งต่อ|ประสาน(งาน)?|โอน|ฝาก)(ให้|เรื่อง|ข้อมูล)?(ทีมงาน|เจ้าหน้าที่|แอดมิน|ฝ่าย\S*)|(ส่งต่อ|ประสาน)(ให้|เรื่อง)(ทีมงาน|เจ้าหน้าที่|แอดมิน|ฝ่าย\S*)(ดูแล|รับช่วง|ช่วย|พิจารณา)|(แจ้ง|บอก)(ทีมงาน|เจ้าหน้าที่|แอดมิน)ให้(ติดต่อ|รับช่วง|ดูแล)/;

Deno.test("guardrail wording triggers handover regex", () => {
  const gr = buildGuardrailBlock();
  assert(handoverPatterns.test(gr), "guardrail wording must match handover regex");
  assert(handoverPatterns.test("ขอประสานงานทีมงานให้ดูแลเรื่องนี้ต่อค่ะ 🙏"));
});

Deno.test("lifecycle block: exists for every non-legacy lifecycle", () => {
  const lifecycles = [
    "new","pending_confirm","confirmed","postponed",
    "completed_recent","completed_warm","completed_old","completed_unknown",
  ] as const;
  for (const lc of lifecycles) {
    const b = buildLifecycleBlock(lc);
    assert(b.length > 0, `missing block for ${lc}`);
    assert(b.startsWith(`[LIFECYCLE:${lc}]`), `bad prefix for ${lc}`);
  }
  assertEquals(buildLifecycleBlock("legacy"), "");
  assertEquals(buildLifecycleBlock(undefined as any), "");
});

Deno.test("lifecycle block: pending_confirm contains no-repeat + ask-only-missing guidance", () => {
  const b = buildLifecycleBlock("pending_confirm");
  assert(b.includes("ห้ามถามข้อมูลพื้นฐานซ้ำ"), "must instruct not to re-ask basic info");
  assert(b.includes("ถามเฉพาะข้อมูลที่ขาดเท่านั้น"), "must instruct to ask only missing fields");
});

// ── buildPrompt byte-identical when disabled ─────────────────────────────────

const baseInput: BuildPromptInput = {
  cfg: { ai_persona: "test persona", strict_rules: ["r1"], reply_length: 60, reply_bubbles: 3 },
  kbContext: "kb",
  pkgContext: "pkg",
  promoContext: "promo",
  imageListStr: "imgs",
  recentMsgs: "conv",
  messageText: "hi",
};

Deno.test("buildPrompt: policyEnabled undefined → baseline", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, lifecycle: "confirmed", replyMode: "care_mode" });
  assertEquals(a.systemPrompt, b.systemPrompt);
});

Deno.test("buildPrompt: policyEnabled=false → baseline (byte-identical)", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, policyEnabled: false, lifecycle: "confirmed" });
  assertEquals(a.systemPrompt, b.systemPrompt);
});

Deno.test("buildPrompt: policyEnabled=true but lifecycle missing → baseline", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, policyEnabled: true });
  assertEquals(a.systemPrompt, b.systemPrompt);
});

Deno.test("buildPrompt: policyEnabled=true + lifecycle=legacy → baseline", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, policyEnabled: true, lifecycle: "legacy" });
  assertEquals(a.systemPrompt, b.systemPrompt);
});

Deno.test("buildPrompt: policyEnabled=true + confirmed → injects lifecycle + guardrail", () => {
  const a = buildPrompt(baseInput);
  const b = buildPrompt({ ...baseInput, policyEnabled: true, lifecycle: "confirmed", replyMode: "care_mode" });
  assert(b.systemPrompt !== a.systemPrompt);
  assert(b.systemPrompt.includes("[LIFECYCLE:confirmed]"));
  assert(b.systemPrompt.includes("[GUARDRAIL]"));
  assert(handoverPatterns.test(b.systemPrompt), "injected guardrail must trigger handover regex");
});

Deno.test("buildPrompt: baseline output has no [LIFECYCLE]/[GUARDRAIL] markers", () => {
  const a = buildPrompt(baseInput);
  assert(!a.systemPrompt.includes("[LIFECYCLE:"));
  assert(!a.systemPrompt.includes("[GUARDRAIL]"));
});
