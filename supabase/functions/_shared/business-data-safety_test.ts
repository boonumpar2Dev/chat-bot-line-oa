// Business Data Safety Policy — shared across Legacy + Phase 2.
// Guarantees identical anti-hallucination coverage for business-data topics
// (prices, add-on fees, discounts, promos, min-order, delivery, terms).

import { assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildBusinessDataSafetyBlock } from "./ai-policy.ts";
import { buildPrompt } from "./prompt-builder.ts";

const MARKER = "[BUSINESS_DATA_SAFETY]";
const FALLBACK = "ขออนุญาตเช็กข้อมูลกับแอดมินก่อนนะคะ";

const baseInput = {
  cfg: { ai_persona: "persona", strict_rules: ["rule1"] },
  kbContext: "",
  pkgContext: "",
  promoContext: "",
  imageListStr: "",
  recentMsgs: "",
  messageText: "เพิ่มเมนูอาหารคาวคิดเท่าไหร่",
};

Deno.test("block enumerates business-data topics + fallback wording", () => {
  const b = buildBusinessDataSafetyBlock();
  assertStringIncludes(b, MARKER);
  for (const topic of [
    "ราคา",
    "ค่าเพิ่มเมนู",
    "ค่าบริการ",
    "ส่วนลด",
    "โปรโมชั่น",
    "จำนวนขั้นต่ำ",
    "ค่าขนส่ง",
    "เงื่อนไขแพ็กเกจ",
  ]) {
    assertStringIncludes(b, topic);
  }
  assertStringIncludes(b, FALLBACK);
  assertStringIncludes(b, "ห้ามใช้ความรู้ทั่วไปของโมเดล");
});

Deno.test("Legacy flow (policyEnabled=false) — block is injected", () => {
  const { systemPrompt } = buildPrompt({ ...baseInput, policyEnabled: false });
  assertStringIncludes(systemPrompt, MARKER);
  assertStringIncludes(systemPrompt, FALLBACK);
});

Deno.test("Phase 2 flow (policyEnabled=true) — block is injected", () => {
  const { systemPrompt } = buildPrompt({
    ...baseInput,
    policyEnabled: true,
    lifecycle: "pending_confirm",
    replyMode: "new_customer",
  });
  assertStringIncludes(systemPrompt, MARKER);
  assertStringIncludes(systemPrompt, FALLBACK);
});

Deno.test("Legacy and Phase 2 both include the SAME business-data safety text", () => {
  const legacy = buildPrompt({ ...baseInput, policyEnabled: false }).systemPrompt;
  const phase2 = buildPrompt({
    ...baseInput,
    policyEnabled: true,
    lifecycle: "pending_confirm",
    replyMode: "new_customer",
  }).systemPrompt;
  const block = buildBusinessDataSafetyBlock();
  assert(legacy.includes(block), "legacy missing shared block");
  assert(phase2.includes(block), "phase2 missing shared block");
});
