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
  buildFollowUpDisciplineBlock,
  buildThaiPolitenessBlock,
  buildImageInvitationDisciplineBlock,
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

// ── Phase B: Delivery Rules ──
const deliveryCfg = {
  default_message: "งานอาหารอย่างเดียวมีค่าขนส่งตามพื้นที่ค่ะ",
  no_free_delivery_unless_specified: true,
  unknown_area_reply: "มีค่าขนส่งตามพื้นที่ค่ะ ขอประสานงานทีมงานเช็กให้เพิ่มเติมนะคะ",
  zones: [] as any[],
};

Deno.test("PhaseB: buildDeliveryRulesBlock returns '' when config missing/empty", () => {
  assertEquals(buildDeliveryRulesBlock(null), "");
  assertEquals(buildDeliveryRulesBlock(undefined), "");
  assertEquals(buildDeliveryRulesBlock({}), "");
});

Deno.test("PhaseB: delivery block uses 'ค่าขนส่ง' and forbids 'ค่าพื้นที่ขนส่ง'", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  assertStringIncludes(b, "ค่าขนส่ง");
  assertStringIncludes(b, `**ห้ามใช้** "ค่าพื้นที่ขนส่ง"`);
});

Deno.test("PhaseB: no_free_delivery_unless_specified + no free zone → hard-forbids 'ส่งฟรี'", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  assertStringIncludes(b, `**ห้ามพูด "ส่งฟรี"`);
  assertStringIncludes(b, "ไม่มี zone ใดกำหนด free=true");
});

Deno.test("PhaseB: empty zones renders unknown_area_reply + default_message", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  assertStringIncludes(b, "งานอาหารอย่างเดียวมีค่าขนส่งตามพื้นที่ค่ะ");
  assertStringIncludes(b, "มีค่าขนส่งตามพื้นที่ค่ะ ขอประสานงานทีมงานเช็กให้เพิ่มเติมนะคะ");
  assertStringIncludes(b, "ยังไม่ระบุ zones");
});

Deno.test("PhaseB: zone with free=true relaxes ban to 'unless zone free=true'", () => {
  const b = buildDeliveryRulesBlock({
    ...deliveryCfg,
    zones: [{ name: "ในเขตกรุงเทพชั้นใน", free: true, condition: "ยอด ≥ 20,000" }],
  });
  assertStringIncludes(b, "เว้นแต่ตรงกับ zone ที่ระบุ free=true");
  assertStringIncludes(b, "ในเขตกรุงเทพชั้นใน");
});

Deno.test("PhaseB: buildPrompt injects [DELIVERY_RULES] when policyEnabled + cfg.delivery_rules set", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    cfg: { ...base.cfg, delivery_rules: deliveryCfg },
    policyEnabled: true,
    lifecycle: "new",
  });
  assertStringIncludes(systemPrompt, "[DELIVERY_RULES]");
  assertStringIncludes(systemPrompt, `**ห้ามพูด "ส่งฟรี"`);
});

Deno.test("PhaseB: baseline preserved — policyEnabled=false → no [DELIVERY_RULES]", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    cfg: { ...base.cfg, delivery_rules: deliveryCfg },
    policyEnabled: false,
    lifecycle: "new",
  });
  assert(!systemPrompt.includes("[DELIVERY_RULES]"));
});

Deno.test("PhaseB: policyEnabled=true but no delivery_rules → no [DELIVERY_RULES]", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    policyEnabled: true,
    lifecycle: "new",
  });
  assert(!systemPrompt.includes("[DELIVERY_RULES]"));
});


// ── Phase B.1: Delivery hardening + FollowUp Discipline + Thai Politeness ──

Deno.test("PhaseB.1: zones=[] → block forces unknown_area_reply + zones ว่าง rule", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  assertStringIncludes(b, "zones ว่าง");
  assertStringIncludes(b, "ทุกพื้นที่เป็น unknown");
  assertStringIncludes(b, "unknown_area_reply");
  assertStringIncludes(b, "ลาดพร้าว");
});

Deno.test("PhaseB.1: no free zone → forbidden list includes all synonyms", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  for (const w of [
    "ส่งฟรี",
    "ฟรีค่าส่ง",
    "ฟรีค่าจัดส่ง",
    "ไม่มีค่าขนส่ง",
    "ไม่มีค่าส่ง",
    "ไม่คิดค่าส่ง",
    "ไม่เสียค่าส่ง",
  ]) {
    assertStringIncludes(b, w);
  }
});

Deno.test("PhaseB.1: context continuity — food-only + delivery follow-up", () => {
  const b = buildDeliveryRulesBlock(deliveryCfg);
  assertStringIncludes(b, "Context continuity");
  assertStringIncludes(b, "งานอาหารอย่างเดียว");
  assertStringIncludes(b, "ห้ามถามซ้ำว่างานอะไร");
  assertStringIncludes(b, "ห้ามบอกว่าฟรี");
});

Deno.test("PhaseB.1: FOLLOWUP_DISCIPLINE forbids menu/theme/drink follow-ups", () => {
  const b = buildFollowUpDisciplineBlock();
  assertStringIncludes(b, "[FOLLOWUP_DISCIPLINE]");
  assertStringIncludes(b, "ห้ามปั้นคำถาม follow-up เอง");
  assertStringIncludes(b, "เมนู");
  assertStringIncludes(b, "ธีม");
  assertStringIncludes(b, "เครื่องดื่ม");
  assertStringIncludes(b, "จำนวนโต๊ะ");
  assertStringIncludes(b, "สนใจบุฟเฟต์เมนูไหน");
});

Deno.test("PhaseB.1: FOLLOWUP_DISCIPLINE allowed = วันจัดงาน / handover", () => {
  const b = buildFollowUpDisciplineBlock();
  assertStringIncludes(b, "วันจัดงาน");
  assertStringIncludes(b, "handover");
});

Deno.test("PhaseB.1: THAI_POLITENESS covers คะ/ค่ะ/นะคะ + bans นะค่ะ + ค่ะนะคะ", () => {
  const b = buildThaiPolitenessBlock();
  assertStringIncludes(b, "[THAI_POLITENESS]");
  assertStringIncludes(b, `**"ค่ะ"**`);
  assertStringIncludes(b, `**"คะ"**`);
  assertStringIncludes(b, `**"นะคะ"**`);
  assertStringIncludes(b, `ห้ามใช้ "นะค่ะ"`);
  assertStringIncludes(b, "ค่ะนะคะ");
  assertStringIncludes(b, "จัดวันไหนคะ");
  assertStringIncludes(b, "รับทราบค่ะ");
});

Deno.test("PhaseB.1: buildPrompt injects [FOLLOWUP_DISCIPLINE] + [THAI_POLITENESS] when policyEnabled=true", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    policyEnabled: true,
    lifecycle: "new",
  });
  assertStringIncludes(systemPrompt, "[FOLLOWUP_DISCIPLINE]");
  assertStringIncludes(systemPrompt, "[THAI_POLITENESS]");
});

Deno.test("PhaseB.1: baseline preserved — policyEnabled=false → no new blocks", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    policyEnabled: false,
    lifecycle: "new",
  });
  assert(!systemPrompt.includes("[FOLLOWUP_DISCIPLINE]"));
  assert(!systemPrompt.includes("[THAI_POLITENESS]"));
});

// ── Phase B.2: Image invitation discipline ──

Deno.test("PhaseB.2: IMAGE_INVITATION_DISCIPLINE block lists invitation phrases + must-attach rule", () => {
  const b = buildImageInvitationDisciplineBlock();
  assertStringIncludes(b, "[IMAGE_INVITATION_DISCIPLINE]");
  for (const kw of ["ลองดูรูป", "ลองดูเมนู", "ดูภาพ", "ดูตัวอย่าง", "แนบรูปให้", "ส่งรูปให้", "ตามนี้เลยนะคะ"]) {
    assertStringIncludes(b, kw);
  }
  assertStringIncludes(b, "ต้องใส่ image_titles");
  assertStringIncludes(b, "ห้ามพูดคำเชิญชวนดูรูป");
});

Deno.test("PhaseB.2: buildPrompt injects [IMAGE_INVITATION_DISCIPLINE] when policyEnabled=true", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: true, lifecycle: "new" });
  assertStringIncludes(systemPrompt, "[IMAGE_INVITATION_DISCIPLINE]");
});

Deno.test("PhaseB.2: baseline preserved — policyEnabled=false → no [IMAGE_INVITATION_DISCIPLINE]", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: false, lifecycle: "new" });
  assert(!systemPrompt.includes("[IMAGE_INVITATION_DISCIPLINE]"));
});

// ── Phase C: Service Scopes config-driven ──

const default7Scopes = [
  { id: "merit_chinese_table", name: "บุญ+โต๊ะจีน", sort_order: 10, aliases: ["โต๊ะจีน", "ทำบุญโต๊ะจีน"], accepted: true },
  { id: "merit_buffet", name: "บุญ+บุฟเฟต์", sort_order: 20, aliases: ["บุญบุฟเฟต์"], accepted: true },
  { id: "merit_food_stall", name: "บุญ+ซุ้มอาหาร", sort_order: 30, aliases: ["ซุ้มอาหาร"], accepted: true },
  { id: "rental_ceremony_no_food", name: "เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร", sort_order: 40, aliases: ["เช่าอุปกรณ์+พิธีสงฆ์", "เช่าอุปกรณ์พิธีสงฆ์ ไม่เอาอาหาร"], accepted: true },
  { id: "buangsuang", name: "บวงสรวง", sort_order: 50, aliases: ["พิธีบวงสรวง"], accepted: true },
  { id: "food_only_buffet", name: "งานอาหารเท่านั้นรูปแบบบุฟเฟต์", sort_order: 60, aliases: ["อาหารอย่างเดียว", "จัดเลี้ยงอย่างเดียว"], accepted: true },
  { id: "unclear", name: "ยังไม่ชัดเจน", sort_order: 70, aliases: [], accepted: true },
];

Deno.test("PhaseC: buildServiceScopeBlock(null) → fallback hardcode preserved", () => {
  const b = buildServiceScopeBlock(null);
  assertStringIncludes(b, "บุญ+โต๊ะจีน");
  assertStringIncludes(b, "ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์");
  assertStringIncludes(b, "service_type=บุฟเฟต์");
});

Deno.test("PhaseC: {} / {service_scopes: []} → fallback hardcode preserved", () => {
  assertStringIncludes(buildServiceScopeBlock({}), "บุญ+โต๊ะจีน");
  assertStringIncludes(buildServiceScopeBlock({ service_scopes: [] }), "บุญ+โต๊ะจีน");
  assertStringIncludes(buildServiceScopeBlock({ service_scopes: null as any }), "บุญ+โต๊ะจีน");
});

Deno.test("PhaseC: config-driven renders all 7 default scopes + aliases", () => {
  const b = buildServiceScopeBlock({ service_scopes: default7Scopes });
  for (const s of default7Scopes) assertStringIncludes(b, s.name);
  assertStringIncludes(b, "aliases: อาหารอย่างเดียว");
  assertStringIncludes(b, "aliases: โต๊ะจีน");
});

Deno.test("PhaseC: accepted=false + standard_reply → renders reject inline", () => {
  const b = buildServiceScopeBlock({
    service_scopes: [
      ...default7Scopes,
      { id: "rental_only", name: "เช่าโต๊ะเก้าอี้อย่างเดียว", sort_order: 80, accepted: false, standard_reply: "ยังไม่มีบริการนี้ค่ะ" },
    ],
  });
  assertStringIncludes(b, "เช่าโต๊ะเก้าอี้อย่างเดียว");
  assertStringIncludes(b, "**ไม่รับ scope นี้**");
  assertStringIncludes(b, "ยังไม่มีบริการนี้ค่ะ");
});

Deno.test("PhaseC: custom service_scope_ambiguous_reply used verbatim", () => {
  const b = buildServiceScopeBlock({
    service_scopes: default7Scopes,
    service_scope_ambiguous_reply: "ขอสอบถามแบบไหนดีคะ A/B/C?",
  });
  assertStringIncludes(b, "ขอสอบถามแบบไหนดีคะ A/B/C?");
});

Deno.test("PhaseC: requires_handover=true → renders 'ต้องส่งต่อทีมงาน'", () => {
  const b = buildServiceScopeBlock({
    service_scopes: [{ id: "vip", name: "งาน VIP", sort_order: 5, accepted: true, requires_handover: true }],
  });
  assertStringIncludes(b, "งาน VIP");
  assertStringIncludes(b, "ต้องส่งต่อทีมงาน");
});

Deno.test("PhaseC: sort_order controls render order", () => {
  const b = buildServiceScopeBlock({
    service_scopes: [
      { id: "b", name: "SecondScope", sort_order: 20 },
      { id: "a", name: "FirstScope", sort_order: 10 },
    ],
  });
  const iA = b.indexOf("FirstScope");
  const iB = b.indexOf("SecondScope");
  assert(iA > 0 && iB > 0 && iA < iB);
  assertStringIncludes(b, "1. **FirstScope**");
  assertStringIncludes(b, "2. **SecondScope**");
});

Deno.test("PhaseC: reject rules block renders trigger + reply", () => {
  const b = buildServiceScopeBlock({
    service_scopes: default7Scopes,
    service_scopes_reject_rules: [
      { trigger_aliases: ["เช่าโต๊ะเก้าอี้อย่างเดียว", "เช่าโต๊ะอย่างเดียว"], standard_reply: "ตอนนี้ยังไม่มีบริการนี้ค่ะ" },
    ],
  });
  assertStringIncludes(b, "เช่าโต๊ะเก้าอี้อย่างเดียว");
  assertStringIncludes(b, "ตอนนี้ยังไม่มีบริการนี้ค่ะ");
});

Deno.test("PhaseC: buildPrompt policyEnabled=true + no config → still has SERVICE_SCOPE (fallback)", () => {
  const { systemPrompt } = buildPrompt({ ...base, policyEnabled: true, lifecycle: "new" });
  assertStringIncludes(systemPrompt, "[SERVICE_SCOPE]");
  assertStringIncludes(systemPrompt, "บุญ+โต๊ะจีน");
});

Deno.test("PhaseC: buildPrompt reads cfg.ai_policy_config.service_scopes for rendering", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    cfg: {
      ...base.cfg,
      ai_policy_config: {
        service_scopes: [{ id: "x", name: "ScopeAlpha", sort_order: 1 }],
        service_scope_ambiguous_reply: "AmbigCustomZ",
      },
    },
    policyEnabled: true,
    lifecycle: "new",
  });
  assertStringIncludes(systemPrompt, "ScopeAlpha");
  assertStringIncludes(systemPrompt, "AmbigCustomZ");
});

Deno.test("PhaseC: baseline preserved — policyEnabled=false → no [SERVICE_SCOPE] regardless of config", () => {
  const { systemPrompt } = buildPrompt({
    ...base,
    cfg: { ...base.cfg, ai_policy_config: { service_scopes: default7Scopes } },
    policyEnabled: false,
    lifecycle: "new",
  });
  assert(!systemPrompt.includes("[SERVICE_SCOPE]"));
});
