// Existing-Cycle Resolver + Post-AI Enforcement tests
//
// ครอบคลุม Test A–I ตามข้อกำหนดผู้ใช้ (14 ก.ค. 2569).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveExistingCycle } from "./existing-cycle-resolver.ts";
import { enforceExistingCyclePolicy } from "./existing-cycle-post-enforcement.ts";
import {
  EXISTING_CYCLE_REPLIES,
  pickExistingCycleReplyIntent,
} from "./existing-cycle-reply.ts";

const adminHistory = [
  { sender: "customer", message: "สนใจจัดงานค่ะ" },
  { sender: "admin", message: "ขอสอบถามจำนวนแขกค่ะ" },
];
const quoteEvidence = [
  { sender: "customer", message: "รอราคาค่ะ" },
  { sender: "admin", message: "แนบใบเสนอราคาให้ค่ะ" },
];

// ── Reply-intent selector ──────────────────────────────────────────────
Deno.test("Reply intent — menu keyword wins", () => {
  assertEquals(pickExistingCycleReplyIntent("ขอเปลี่ยนเมนูค่ะ"), "menu");
});
Deno.test("Reply intent — schedule keyword", () => {
  assertEquals(pickExistingCycleReplyIntent("ทีมงานจะเข้ามาสำรวจสถานที่วันไหน"), "schedule");
});
Deno.test("Reply intent — existing_discussion", () => {
  assertEquals(pickExistingCycleReplyIntent("เคยบอกไปแล้วนะคะ"), "existing_discussion");
});
Deno.test("Reply intent — general fallback", () => {
  assertEquals(pickExistingCycleReplyIntent("ค่ะ"), "general");
});
Deno.test("Reply wording — no 'รับทราบ'", () => {
  for (const v of Object.values(EXISTING_CYCLE_REPLIES)) {
    assert(!v.includes("รับทราบ"), `reply must not contain 'รับทราบ': ${v}`);
  }
});

// ── Test A — Historical event only → NOT current cycle ───────────────────
Deno.test("Test A — historical completed event only → mode=false", () => {
  const r = resolveExistingCycle({
    currentStatus: "completed",
    messageText: "สวัสดีค่ะ",
    recentConvs: [],
    hasCurrentEvent: false,
    supporting: { hasHistoricalCompletedEvent: true },
  });
  assertEquals(r.existingCycleMode, false);
  assertEquals(r.explicitNewCycle, false);
  assert(r.supportingEvidence.includes("historical_completed_event"));
});

// ── Test B — Old status log only → NOT current cycle ────────────────────
Deno.test("Test B — status=new + past pending_confirm in log only → mode=false", () => {
  const r = resolveExistingCycle({
    currentStatus: "new",
    messageText: "สวัสดีค่ะ",
    recentConvs: [],
    hasCurrentEvent: false,
    supporting: { hasHistoricalStatusLog: true },
  });
  assertEquals(r.existingCycleMode, false);
});

// ── Test C — Current pending_confirm fields null → mode=true ────────────
Deno.test("Test C — pending_confirm (fields null) → mode=true, no lead reask allowed", () => {
  const r = resolveExistingCycle({
    currentStatus: "pending_confirm",
    messageText: "สอบถามเรื่องกำหนดการค่ะ",
    recentConvs: [],
  });
  assertEquals(r.existingCycleMode, true);
  assert(r.strongEvidence.includes("status:pending_confirm"));
});

// ── Test D — confirmed_returning → mode=true ────────────────────────────
Deno.test("Test D — confirmed_returning → mode=true", () => {
  const r = resolveExistingCycle({
    currentStatus: "confirmed_returning",
    messageText: "ขอสอบถามเมนูค่ะ",
    recentConvs: [],
  });
  assertEquals(r.existingCycleMode, true);
  assert(r.strongEvidence.includes("status:confirmed_returning"));
});

// ── Test E — recent quotation evidence but status=new → mode=true ──────
Deno.test("Test E — status=new + recent admin/AI mentions ใบเสนอราคา → mode=true (strong evidence)", () => {
  const r = resolveExistingCycle({
    currentStatus: "new",
    messageText: "ขอเช็กราคาอีกทีค่ะ",
    recentConvs: quoteEvidence,
  });
  assertEquals(r.existingCycleMode, true);
  assert(r.strongEvidence.includes("recent_quotation"));
});

// ── Test F — Explicit new cycle overrides everything ────────────────────
Deno.test("Test F — 'ขอสอบถามงานใหม่อีกงานค่ะ' → explicitNewCycle, mode=false", () => {
  const r = resolveExistingCycle({
    currentStatus: "confirmed",
    messageText: "ขอสอบถามงานใหม่อีกงานค่ะ",
    recentConvs: quoteEvidence,
    hasCurrentEvent: true,
  });
  assertEquals(r.explicitNewCycle, true);
  assertEquals(r.existingCycleMode, false);
});

// ── Test G — Date alone is NOT a new cycle ─────────────────────────────
Deno.test("Test G — 'วันที่ 25 ว่างไหมคะ' + pending_confirm → mode stays true, not new cycle", () => {
  const r = resolveExistingCycle({
    currentStatus: "pending_confirm",
    messageText: "วันที่ 25 ว่างไหมคะ",
    recentConvs: [],
  });
  assertEquals(r.explicitNewCycle, false);
  assertEquals(r.existingCycleMode, true);
});

// ── Test H — Fake approval → replace whole bubble ──────────────────────
Deno.test("Test H — raw 'ได้เลยค่ะ เปลี่ยนเมนูให้เรียบร้อยแล้วค่ะ' → replace with menu handoff", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ได้เลยค่ะ เปลี่ยนเมนูให้เรียบร้อยแล้วค่ะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "ขอเปลี่ยนเมนูค่ะ",
  });
  assertEquals(r.action, "replace_handoff");
  assertEquals(r.finalAnswer, EXISTING_CYCLE_REPLIES.menu);
  assertEquals(r.replyIntent, "menu");
});

// ── Test I — Safe answer + unrelated reask (unsupported approval hidden) ─
Deno.test("Test I — 'เมนูนี้สามารถเปลี่ยนได้ค่ะ รบกวนแจ้งจำนวนแขก' → replace whole bubble (unsupported approval)", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "เมนูนี้สามารถเปลี่ยนได้ค่ะ รบกวนแจ้งจำนวนแขกเพิ่มเติมนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "ขอเปลี่ยนเมนูค่ะ",
  });
  assertEquals(r.action, "replace_handoff");
  assertEquals(r.finalAnswer, EXISTING_CYCLE_REPLIES.menu);
});

// ── Extra: clean strip when lead-reask is a clearly separated segment ───
Deno.test("Strip — safe answer + trailing separable lead-reask → strip only", () => {
  const raw = "แพ็กเกจนี้รวมของหวานแล้วค่ะ\nรบกวนแจ้งจำนวนแขกเพิ่มเติมนะคะ";
  const r = enforceExistingCyclePolicy({
    rawAnswer: raw,
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "แพ็กเกจนี้รวมอะไรบ้างคะ",
  });
  assertEquals(r.action, "strip_reask");
  assert(!/(?:จำนวน|กี่ท่าน|กี่คน)/.test(r.finalAnswer));
  assert(r.finalAnswer.includes("แพ็กเกจนี้รวมของหวานแล้วค่ะ"));
});

// ── Mode off → keep untouched ──────────────────────────────────────────
Deno.test("Enforcement off when explicitNewCycle=true", () => {
  const raw = "ได้เลยค่ะ ยืนยันให้แล้ว";
  const r = enforceExistingCyclePolicy({
    rawAnswer: raw,
    existingCycleMode: true,
    explicitNewCycle: true,
    messageText: "งานใหม่ค่ะ",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.finalAnswer, raw);
});

Deno.test("Enforcement off when mode=false", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ยืนยันให้แล้วค่ะ",
    existingCycleMode: false,
    explicitNewCycle: false,
    messageText: "ค่ะ",
  });
  assertEquals(r.action, "keep");
});

// ── Supporting-only evidence never opens mode ─────────────────────────
Deno.test("Supporting facts alone (phone) → mode=false", () => {
  const r = resolveExistingCycle({
    currentStatus: "new",
    messageText: "สวัสดีค่ะ",
    recentConvs: [],
    supporting: { hasStructuredFacts: true, hasAdminConversationHistory: true },
  });
  assertEquals(r.existingCycleMode, false);
  assert(r.supportingEvidence.length >= 2);
});
