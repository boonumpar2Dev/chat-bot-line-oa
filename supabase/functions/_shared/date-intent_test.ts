// Phase 2A tests — B1 helpers.
// Covers the 20 test cases in the Phase 2A spec. Each Deno.test corresponds
// to the numbered test in the request.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyDateIntent,
  shouldAllowEventDateOverwrite,
  shouldRerunExtractOnCustomerMessage,
  shouldRerunExtractOnStatus,
  mergeExtractedFields,
} from "./date-intent.ts";
import { parseThaiDateCandidates } from "./ai-policy.ts";

const Y = 2026;
const hasDate = (t: string) => parseThaiDateCandidates(t, { todayYear: Y }).length > 0;

// ── classifyDateIntent — building blocks ────────────────────────────────────

Deno.test("intent: 'คอนเฟิร์มวันจัดงานเป็นวันที่ 25/7/69' → confirm", () => {
  assertEquals(classifyDateIntent("คอนเฟิร์มวันจัดงานเป็นวันที่ 25/7/69 นะคะ"), "confirm");
});
Deno.test("intent: '25/7/69 ว่างไหมคะ' → inquiry", () => {
  assertEquals(classifyDateIntent("25/7/69 ว่างไหมคะ"), "inquiry");
});
Deno.test("intent: 'ขอเปลี่ยนวันเป็น 3/8/69 ค่ะ' → change", () => {
  assertEquals(classifyDateIntent("ขอเปลี่ยนวันเป็น 3/8/69 ค่ะ"), "change");
});
Deno.test("intent: bare date '25/7/69 ค่ะ' → mention", () => {
  assertEquals(classifyDateIntent("25/7/69 ค่ะ"), "mention");
});
Deno.test("intent: 'ยืนยันวันที่ 25 กค 69' → confirm", () => {
  assertEquals(classifyDateIntent("ยืนยันวันที่ 25 กค 69"), "confirm");
});
Deno.test("intent: OCR block ignored — 'ตามภาพ\\n📄 เนื้อหาในรูป:\\nคอนเฟิร์ม 25/7/69' → mention", () => {
  const t = "ตามภาพนะคะ\n📄 เนื้อหาในรูป:\nคอนเฟิร์ม 25/7/69";
  assertEquals(classifyDateIntent(t), "mention");
});

// ── Test 1 — Explicit customer confirm ──────────────────────────────────────

Deno.test("T1: explicit customer confirm → gate=allow(explicit_confirm)", () => {
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "customer_message",
    anchorProposedIso: "2026-07-25",
    latestCustomerMessageText: "คอนเฟิร์มวันจัดงานเป็นวันที่ 25/7/69 นะคะ",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, true);
  assertEquals(g.reason, "explicit_confirm");
  assertEquals(g.intent, "confirm");
});

Deno.test("T1: merge → only event_date changes, other fields untouched", () => {
  const r = mergeExtractedFields({
    current: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-18", venue: "บ้าน" },
    extracted: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-25", venue: "บ้าน" },
    eventDateOverwriteAllowed: true,
  });
  assertEquals(r.changedKeys, ["event_date"]);
  assertEquals(r.update.event_date, "2026-07-25");
});

// ── Test 2 — availability inquiry ───────────────────────────────────────────

Deno.test("T2: availability inquiry → gate=deny(intent_inquiry), stored preserved", () => {
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "customer_message",
    anchorProposedIso: "2026-07-25",
    latestCustomerMessageText: "25/7/69 ว่างไหมคะ",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, false);
  assertEquals(g.reason, "intent_inquiry");
});
Deno.test("T2: rerun trigger — inquiry does NOT rerun extractor", () => {
  const text = "25/7/69 ว่างไหมคะ";
  const r = shouldRerunExtractOnCustomerMessage(text, hasDate(text));
  assertEquals(r.rerun, false);
  assertEquals(r.intent, "inquiry");
});

// ── Test 3 — Explicit change ────────────────────────────────────────────────

Deno.test("T3: explicit change → gate=allow(explicit_change)", () => {
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "customer_message",
    anchorProposedIso: "2026-08-03",
    latestCustomerMessageText: "ขอเปลี่ยนวันเป็น 3/8/69 ค่ะ",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, true);
  assertEquals(g.reason, "explicit_change");
});
Deno.test("T3: rerun trigger — explicit change reruns extractor", () => {
  const text = "ขอเปลี่ยนวันเป็น 3/8/69 ค่ะ";
  const r = shouldRerunExtractOnCustomerMessage(text, hasDate(text));
  assertEquals(r.rerun, true);
  assertEquals(r.intent, "change");
});

// ── Test 4 — Month change WITHOUT confirmation ──────────────────────────────

Deno.test("T4: month-change bare inquiry → gate=deny, no silent overwrite", () => {
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "customer_message",
    anchorProposedIso: "2026-08-03",
    latestCustomerMessageText: "3/8/69 ว่างไหมคะ",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, false);
  assertEquals(g.reason, "intent_inquiry");
  // Also confirm merge keeps stored
  const m = mergeExtractedFields({
    current: { event_date: "2026-07-18" },
    extracted: { event_date: "2026-08-03" },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(m.changedKeys, []);
});

// ── Test 5 — AI message with date must NEVER be an overwrite source ─────────

Deno.test("T5: anchor source=ai_message → gate=deny (source guard)", () => {
  // Even if caller mis-labels confidence=high, the source check must block.
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "ai_message" as any,
    anchorProposedIso: "2026-07-25",
    latestCustomerMessageText: "สวัสดีค่ะ",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, false);
  assert(g.reason.startsWith("source_"));
});

// ── Test 6 — Customer confirm outranks admin mention ────────────────────────

Deno.test("T6: anchor source=admin_message → gate=deny (only customer wins)", () => {
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "admin_message",
    anchorProposedIso: "2026-07-18",
    latestCustomerMessageText: "คอนเฟิร์ม 25/7/69",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, false);
  assertEquals(g.reason, "source_admin_message");
});

// ── Test 7-9 — Status transition triggers ───────────────────────────────────

Deno.test("T7: transition inquiry → pending_confirm reruns extractor", () => {
  const r = shouldRerunExtractOnStatus("inquiry", "pending_confirm");
  assertEquals(r.rerun, true);
  assertEquals(r.reason, "transition_pending_confirm");
});
Deno.test("T8: transition into pending_confirm with no new evidence still reruns (extractor decides no-op)", () => {
  // Trigger is only "should we call?" — idempotency is enforced by the merger.
  const r = shouldRerunExtractOnStatus("inquiry", "pending_confirm");
  assertEquals(r.rerun, true);
  // No-op merge when extracted values match current
  const m = mergeExtractedFields({
    current: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-25", venue: "บ้าน" },
    extracted: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-25", venue: "บ้าน" },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(m.changedKeys, []);
});
Deno.test("T9: transition unrelated (pending_quote → confirmed) → no rerun", () => {
  const r = shouldRerunExtractOnStatus("pending_quote", "confirmed");
  assertEquals(r.rerun, false);
});
Deno.test("T9b: no transition (same status) → no rerun", () => {
  const r = shouldRerunExtractOnStatus("pending_confirm", "pending_confirm");
  assertEquals(r.rerun, false);
});

// ── Test 10-15 — Field safety via mergeExtractedFields ──────────────────────

Deno.test("T10: venue null + extracted venue → fill_only fills", () => {
  const r = mergeExtractedFields({
    current: { venue: null },
    extracted: { venue: "โรงแรม X" },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(r.update.venue, "โรงแรม X");
});
Deno.test("T11: venue already populated → never overwrite (fill_only)", () => {
  const r = mergeExtractedFields({
    current: { venue: "บ้านลูกค้า" },
    extracted: { venue: "โรงแรม X" },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(r.changedKeys.includes("venue"), false);
});
Deno.test("T12: guest_count null + extracted count → fill", () => {
  const r = mergeExtractedFields({
    current: { guest_count: null },
    extracted: { guest_count: 20 },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(r.update.guest_count, 20);
});
Deno.test("T13: guest_count already populated → no overwrite", () => {
  const r = mergeExtractedFields({
    current: { guest_count: 20 },
    extracted: { guest_count: 999 },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(r.changedKeys.includes("guest_count"), false);
});
Deno.test("T14: event_type null + extracted type → fill", () => {
  const r = mergeExtractedFields({
    current: { event_type: null },
    extracted: { event_type: "งานบุญ" },
    eventDateOverwriteAllowed: false,
  });
  assertEquals(r.update.event_type, "งานบุญ");
});
Deno.test("T15: populated fields + new date confirm → ONLY event_date changes", () => {
  const r = mergeExtractedFields({
    current: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-18", venue: "บ้าน" },
    extracted: { event_type: "งานแต่ง", guest_count: 999, event_date: "2026-07-25", venue: "โรงแรม" },
    eventDateOverwriteAllowed: true,
  });
  assertEquals(r.changedKeys, ["event_date"]);
});

// ── Test 16-18 — Filename ───────────────────────────────────────────────────

Deno.test("T16: filename '25072569-...pdf' parses to 2026-07-25 candidate", () => {
  const c = parseThaiDateCandidates("25072569-งานบุญคุณนุ่น-BNP-N256907-0095.pdf", { todayYear: Y });
  assert(c.some(x => x.isoDate === "2026-07-25"));
});
Deno.test("T17: nonmatching PDF filename → no date candidate", () => {
  const c = parseThaiDateCandidates("quotation-final-v2.pdf", { todayYear: Y });
  assertEquals(c.length, 0);
});
Deno.test("T18: customer confirm 26/7 vs filename 25/7 → customer wins (source_admin_message denies filename)", () => {
  // resolveDateAnchor already gives customer_message priority; here we just
  // confirm that if the anchor is customer, filename-in-admin cannot overwrite
  // by going through the gate with anchor pointing to customer 26/7.
  const g = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "customer_message",
    anchorProposedIso: "2026-07-26",
    latestCustomerMessageText: "คอนเฟิร์ม 26/7/69",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g.allow, true);
  // And if anchor were flipped to admin (filename source), gate denies.
  const g2 = shouldAllowEventDateOverwrite({
    anchorConfidence: "high",
    anchorSource: "admin_message",
    anchorProposedIso: "2026-07-25",
    latestCustomerMessageText: "คอนเฟิร์ม 26/7/69",
    storedEventDate: "2026-07-18",
  });
  assertEquals(g2.allow, false);
});

// ── Test 19-20 — Idempotency / concurrency semantics ────────────────────────

Deno.test("T19: same input → merge is idempotent (no changes on re-run)", () => {
  const input = {
    current: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-25", venue: "บ้าน" },
    extracted: { event_type: "งานบุญ", guest_count: 20, event_date: "2026-07-25", venue: "บ้าน" },
    eventDateOverwriteAllowed: true,
  };
  const r1 = mergeExtractedFields(input);
  // Apply r1.merged then re-run
  const r2 = mergeExtractedFields({ ...input, current: r1.merged });
  assertEquals(r1.changedKeys, []);
  assertEquals(r2.changedKeys, []);
});
Deno.test("T20: concurrent triggers converging on same event_date → deterministic final state", () => {
  // Two triggers (phone + status→pending_confirm) both invoke extract and both
  // see the same latest customer confirm. Both compute the same merge result;
  // whichever writes second is a no-op.
  const shared = {
    current: { event_date: "2026-07-18" },
    extracted: { event_date: "2026-07-25" },
    eventDateOverwriteAllowed: true,
  };
  const first = mergeExtractedFields(shared);
  const second = mergeExtractedFields({ ...shared, current: first.merged });
  assertEquals(first.update.event_date, "2026-07-25");
  assertEquals(second.changedKeys, []);
});
