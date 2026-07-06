// Phase 2.3 — Guardrail expansion, SERVICE_SCOPE (6 real scopes), DEFER,
// CONTEXT_GROUNDED, LATEST_MESSAGE_FACTS, pending_confirm/confirmed rules.
import { assert, assertStringIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGuardrailBlock,
  buildLifecycleBlock,
  buildServiceScopeBlock,
  buildDeferDetectionBlock,
  buildContextGroundedBlock,
  buildLatestMessageFactsBlock,
  buildDeliveryRulesBlock,
} from "./ai-policy.ts";
import { buildPrompt, type BuildPromptInput } from "./prompt-builder.ts";

const base: BuildPromptInput = {
  cfg: { ai_persona: "P", strict_rules: [] },
  kbContext: "", pkgContext: "", promoContext: "", imageListStr: "",
  recentMsgs: "", messageText: "hi",
};

// ── P1: Guardrail + confirmed lifecycle — tax invoice / accounting docs ──
Deno.test("P1: guardrail lists tax invoice / receipt / accounting docs", () => {
  const g = buildGuardrailBlock();
  assertStringIncludes(g, "ใบกำกับภาษี");
  assertStringIncludes(g, "ใบเสร็จ");
  assertStringIncludes(g, "เอกสารบัญชี");
  assertStringIncludes(g, "หัก ณ ที่จ่าย");
  assertStringIncludes(g, "ขอประสานงานทีมงานให้ดูแล");
});

Deno.test("P1: confirmed lifecycle forbids re-asking event fields + tax fields", () => {
  const b = buildLifecycleBlock("confirmed");
  assertStringIncludes(b, "ห้ามถามข้อมูลจัดงานซ้ำ");
  assertStringIncludes(b, "ใบกำกับภาษี");
  assertStringIncludes(b, "ห้ามยืนยันเอง");
  // ห้ามถามเลขผู้เสียภาษี/บริษัท/venue/guests/date เพิ่ม
  assertStringIncludes(b, "ห้ามถามเลขผู้เสียภาษี");
  assertStringIncludes(b, "รับทราบค่ะ เรื่องใบกำกับภาษี");
});

// ── P2: pending_confirm — no lead re-collection after quote ──
Deno.test("P2: pending_confirm mentions ใบเสนอราคา + ห้ามเริ่ม lead collection", () => {
  const b = buildLifecycleBlock("pending_confirm");
  assertStringIncludes(b, "ใบเสนอราคา");
  assertStringIncludes(b, "ห้ามเริ่ม lead collection ใหม่");
  assertStringIncludes(b, "ห้ามถามข้อมูลพื้นฐานซ้ำ");
});

// ── P3: SERVICE_SCOPE — 6 real scopes ──
Deno.test("P3: SERVICE_SCOPE has 6 real bunnumpar scopes", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "บุญ+โต๊ะจีน");
  assertStringIncludes(s, "บุญ+บุฟเฟต์");
  assertStringIncludes(s, "บุญ+ซุ้มอาหาร");
  assertStringIncludes(s, "เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร");
  assertStringIncludes(s, "บวงสรวง");
  assertStringIncludes(s, "งานอาหารเท่านั้นรูปแบบบุฟเฟต์");
  assertStringIncludes(s, "ยังไม่ชัดเจน");
});

Deno.test("P3: 'อาหารอย่างเดียว' maps to food-only scope, not full merit package", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "อาหารอย่างเดียว");
  assertStringIncludes(s, "ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์");
});

Deno.test("P3: 'บุฟเฟต์' single word is service_type not event_type/scope", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "service_type=บุฟเฟต์");
  assertStringIncludes(s, "ไม่ใช่ event_type");
});

Deno.test("P3: 'เช่าโต๊ะเก้าอี้อย่างเดียว' → reject standalone rental", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "เช่าโต๊ะเก้าอี้อย่างเดียว");
  assertStringIncludes(s, "ยังไม่มีบริการให้เช่าโต๊ะเก้าอี้อย่างเดียว");
});

Deno.test("P3: 'เช่าอุปกรณ์พิธีสงฆ์ ไม่เอาอาหาร' → accepted as scope #4", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "เช่าอุปกรณ์พิธีสงฆ์ ไม่เอาอาหาร");
  assertStringIncludes(s, "เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร");
});

// ── P4: LATEST_MESSAGE_FACTS ──
Deno.test("P4: latest-message facts block treats info as known + example ลาดพร้าว 50 คน", () => {
  const b = buildLatestMessageFactsBlock();
  assertStringIncludes(b, "known facts");
  assertStringIncludes(b, "ห้ามถามซ้ำ");
  assertStringIncludes(b, "ลาดพร้าว");
  assertStringIncludes(b, "50");
});

// ── P5: Defer detection unchanged ──
Deno.test("P5: defer detection still covers all defer signals + no-follow-up rule", () => {
  const d = buildDeferDetectionBlock();
  for (const kw of ["เดี๋ยวแจ้งกลับ", "ขอเช็กก่อน", "ขอคิดดูก่อน", "ยังไม่แน่ใจ", "รอก่อน", "ขอปรึกษาก่อน"]) {
    assertStringIncludes(d, kw);
  }
  assertStringIncludes(d, "ห้ามถามข้อมูลต่อ");
});

// ── Prompt injection ──
Deno.test("P4: context-grounded + service_scope + defer + latest_facts present when policyEnabled=true", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: true, lifecycle: "confirmed" });
  assertStringIncludes(systemPrompt, "[CONTEXT_GROUNDED]");
  assertStringIncludes(systemPrompt, "[SERVICE_SCOPE]");
  assertStringIncludes(systemPrompt, "[DEFER_DETECTION]");
  assertStringIncludes(systemPrompt, "[LATEST_MESSAGE_FACTS]");
});

Deno.test("baseline preserved: no policy blocks when policyEnabled=false", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: false, lifecycle: "confirmed" });
  assert(!systemPrompt.includes("[SERVICE_SCOPE]"));
  assert(!systemPrompt.includes("[DEFER_DETECTION]"));
  assert(!systemPrompt.includes("[CONTEXT_GROUNDED]"));
  assert(!systemPrompt.includes("[LATEST_MESSAGE_FACTS]"));
});

Deno.test("context-grounded: forbid overconfident phrases", () => {
  const c = buildContextGroundedBlock();
  assertStringIncludes(c, "จัดการให้ครบแน่นอน");
  assertStringIncludes(c, "ห้ามใช้คำมั่นใจเกินจริง");
});
