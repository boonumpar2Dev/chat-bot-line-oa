// Phase 2.3 — Guardrail expansion, SERVICE_SCOPE, DEFER, CONTEXT_GROUNDED
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGuardrailBlock,
  buildLifecycleBlock,
  buildServiceScopeBlock,
  buildDeferDetectionBlock,
  buildContextGroundedBlock,
} from "./ai-policy.ts";
import { buildPrompt, type BuildPromptInput } from "./prompt-builder.ts";

const base: BuildPromptInput = {
  cfg: { ai_persona: "P", strict_rules: [] },
  kbContext: "", pkgContext: "", promoContext: "", imageListStr: "",
  recentMsgs: "", messageText: "hi",
};

Deno.test("P1: guardrail lists tax invoice / receipt / accounting docs", () => {
  const g = buildGuardrailBlock();
  assertStringIncludes(g, "ใบกำกับภาษี");
  assertStringIncludes(g, "ใบเสร็จ");
  assertStringIncludes(g, "เอกสารบัญชี");
  assertStringIncludes(g, "หัก ณ ที่จ่าย");
  assertStringIncludes(g, "ขอประสานงานทีมงานให้ดูแล");
});

Deno.test("P1: confirmed lifecycle forbids re-asking event fields", () => {
  const b = buildLifecycleBlock("confirmed");
  assertStringIncludes(b, "ห้ามถามข้อมูลจัดงานซ้ำ");
  assertStringIncludes(b, "ใบกำกับภาษี");
});

Deno.test("P2: SERVICE_SCOPE has 5 categories", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "งานบุญครบชุด");
  assertStringIncludes(s, "อาหารอย่างเดียว");
  assertStringIncludes(s, "เช่าอุปกรณ์");
  assertStringIncludes(s, "พิธีสงฆ์");
  assertStringIncludes(s, "ยังไม่ชัดเจน");
});

Deno.test("P2: food-only forbids drifting to full merit package", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์");
});

Deno.test("P2: equipment-only forbids drifting to food/merit", () => {
  const s = buildServiceScopeBlock();
  assertStringIncludes(s, "ห้ามลากไปตอบเมนูอาหาร/แพ็กเกจงานบุญครบชุด");
});

Deno.test("P3: defer detection covers all defer signals", () => {
  const d = buildDeferDetectionBlock();
  for (const kw of ["เดี๋ยวแจ้งกลับ", "ขอเช็กก่อน", "ขอคิดดูก่อน", "ยังไม่แน่ใจ", "รอก่อน", "ขอปรึกษาก่อน"]) {
    assertStringIncludes(d, kw);
  }
  assertStringIncludes(d, "ห้ามถามข้อมูลต่อ");
});

Deno.test("P4: context-grounded rule present in prompt when policy enabled", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: true, lifecycle: "confirmed" });
  assertStringIncludes(systemPrompt, "[CONTEXT_GROUNDED]");
  assertStringIncludes(systemPrompt, "ห้ามเดา");
  assertStringIncludes(systemPrompt, "[SERVICE_SCOPE]");
  assertStringIncludes(systemPrompt, "[DEFER_DETECTION]");
});

Deno.test("P4: new blocks NOT injected when policyEnabled=false (baseline preserved)", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: false, lifecycle: "confirmed" });
  assert(!systemPrompt.includes("[SERVICE_SCOPE]"));
  assert(!systemPrompt.includes("[DEFER_DETECTION]"));
  assert(!systemPrompt.includes("[CONTEXT_GROUNDED]"));
});

Deno.test("context-grounded: forbid overconfident phrases", () => {
  const c = buildContextGroundedBlock();
  assertStringIncludes(c, "จัดการให้ครบแน่นอน");
  assertStringIncludes(c, "ห้ามใช้คำมั่นใจเกินจริง");
});
