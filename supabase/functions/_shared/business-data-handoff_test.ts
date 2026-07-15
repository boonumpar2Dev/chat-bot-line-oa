// Phase 3 — Business Data Handoff resolver tests.
// Covers all cases required by the spec (§12): missing decision, empty ids,
// mismatched ids, valid ids, invalid schema, business+parse-fail, not_applicable,
// plus the shared invariants (fallback text has no numbers, no promise words).

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  BUSINESS_DATA_FALLBACK_TEXT,
  detectBusinessQuestion,
  resolveBusinessDataHandoff,
} from "./business-data-handoff.ts";

const KB = ["kb-1", "kb-2", "pkg-1", "promo-1"];

Deno.test("fallback text: no numbers, no time promise, has handoff wording", () => {
  const t = BUSINESS_DATA_FALLBACK_TEXT;
  assert(!/\d/.test(t), "fallback must not contain digits");
  assert(!/นาที|ชั่วโมง|วัน|ภายใน/.test(t), "fallback must not promise a time");
  assertStringIncludes(t, "แอดมิน");
});

Deno.test("detectBusinessQuestion: pricing keywords → true", () => {
  assert(detectBusinessQuestion("เพิ่มเมนูอาหารคาวคิดยังไงคะ"));
  assert(detectBusinessQuestion("ราคาโต๊ะจีนเท่าไหร่"));
  assert(detectBusinessQuestion("ค่าส่งต่างจังหวัดเท่าไร"));
  assert(!detectBusinessQuestion("สวัสดีค่ะ"));
});

Deno.test("missing decision field + business question → handoff (invalid_schema)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { answer: "..." },
    retrievedSourceIds: KB,
    messageText: "ราคาโต๊ะจีนต่อโต๊ะเท่าไหร่คะ",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_invalid_schema");
  assertEquals(r.fallbackText, BUSINESS_DATA_FALLBACK_TEXT);
});

Deno.test("missing decision field + NON business question → keep (fail-open safe)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { answer: "สวัสดีค่ะ" },
    retrievedSourceIds: KB,
    messageText: "สวัสดีครับ",
  });
  assertEquals(r.action, "keep");
});

Deno.test("answer_from_source + empty source_ids → handoff (source_mismatch)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "answer_from_source", business_data_source_ids: [] },
    retrievedSourceIds: KB,
    messageText: "ราคาโต๊ะจีนต่อโต๊ะเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_mismatch");
});

Deno.test("answer_from_source + all ids NOT in retrieved → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "answer_from_source", business_data_source_ids: ["ghost-1", "ghost-2"] },
    retrievedSourceIds: KB,
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_mismatch");
  assertEquals(r.validatedSourceIds.length, 0);
});

Deno.test("answer_from_source + ids ⊂ retrieved → keep", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "pricing",
      business_data_source_ids: ["kb-1", "pkg-1"],
    },
    retrievedSourceIds: KB,
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.reason, "answer_from_source");
  assertEquals(r.validatedSourceIds, ["kb-1", "pkg-1"]);
});

Deno.test("handoff_missing_source from model → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "handoff_missing_source", business_data_category: "addon" },
    retrievedSourceIds: KB,
    messageText: "เพิ่มเมนูเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_missing_source");
  assertEquals(r.category, "addon");
});

Deno.test("handoff_conflicting_source from model → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "handoff_conflicting_source" },
    retrievedSourceIds: KB,
    messageText: "มัดจำกี่เปอร์เซ็นต์",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_conflicting_source");
});

Deno.test("not_applicable on greeting → keep", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "not_applicable" },
    retrievedSourceIds: KB,
    messageText: "สวัสดีครับ",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.reason, "not_applicable");
});

Deno.test("not_applicable BUT business question → override to handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "not_applicable" },
    retrievedSourceIds: KB,
    messageText: "ค่าเพิ่มเมนูอาหารคาวเท่าไหร่คะ",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_missing_source");
});

Deno.test("invalid decision value + business question → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "totally-bogus" },
    retrievedSourceIds: KB,
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_invalid_schema");
});

Deno.test("invalid category coerces to 'none'", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "handoff_missing_source",
      business_data_category: "not-a-real-category",
    },
    retrievedSourceIds: KB,
    messageText: "?",
  });
  assertEquals(r.category, "none");
});

Deno.test("source_ids array with garbage entries — only clean strings kept", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-1", 42, null, "", "  ", "pkg-1"],
    },
    retrievedSourceIds: KB,
    messageText: "มัดจำกี่เปอร์เซ็นต์",
  });
  assertEquals(r.modelSourceIds, ["kb-1", "pkg-1"]);
  assertEquals(r.action, "keep");
});

Deno.test("Legacy + Phase 2 parity: same input → identical output (deterministic)", () => {
  const input = {
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "pricing",
      business_data_source_ids: ["kb-1"],
    },
    retrievedSourceIds: KB,
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  } as const;
  const a = resolveBusinessDataHandoff(input);
  const b = resolveBusinessDataHandoff(input);
  assertEquals(a, b);
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 3.1 — Source-topic validation regression tests.
// Root cause of Controlled Production Cases 2/3/6: model cited a REAL KB row
// whose id was in retrieved context but whose content was about the WRONG
// topic (e.g. asked about staff fee, cited add-on-food-price KB). The old
// resolver said `keep` because ids matched; the new resolver requires topical
// alignment between question and source.
// ────────────────────────────────────────────────────────────────────────────

const KB_ADDON_FOOD = { id: "kb-addon-food", text: "ค่าเพิ่มรายการอาหารคาว 30 บาทต่อท่าน" };
const KB_STAFF = { id: "kb-staff", text: "ค่าพนักงานเสิร์ฟเพิ่ม 500 บาทต่อคน" };
const KB_DELIVERY = { id: "kb-delivery", text: "ค่าจัดส่งต่างจังหวัด" };

Deno.test("Case A — add-on question with matching add-on source → keep (answer_from_source)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "addon",
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "เพิ่มรายการอาหารคิดอย่างละเท่าไหร่คะ",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.reason, "answer_from_source");
  assertEquals(r.topicMatchedSourceIds, ["kb-addon-food"]);
});

Deno.test("Case B — staff-fee question, model cites add-on-food KB → handoff_source_topic_mismatch", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "addon", // model even mis-labels category
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "เพิ่มพนักงานดูแลงานอีก 3 คน คิดเพิ่มคนละเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_topic_mismatch");
  assertEquals(r.topicMatchedSourceIds.length, 0);
});

Deno.test("Case C — special-service question, only food KB in context → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "บริการพิเศษนี้คิดเพิ่มเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_topic_mismatch");
});

Deno.test("Case D — promotion question, model cites food KB → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "promotion",
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "มีโปรโมชั่นอะไรบ้างคะ",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_topic_mismatch");
});

Deno.test("Case B2 — staff-fee question, staff KB present → keep", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "service_fee",
      business_data_source_ids: ["kb-staff"],
    },
    retrievedSources: [KB_ADDON_FOOD, KB_STAFF],
    messageText: "ค่าพนักงานเพิ่มคนละเท่าไหร่",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.topicMatchedSourceIds, ["kb-staff"]);
});

Deno.test("Case B3 — staff-fee question, model cites BOTH staff + wrong food KB → keep (staff on-topic passes)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-addon-food", "kb-staff"],
    },
    retrievedSources: [KB_ADDON_FOOD, KB_STAFF],
    messageText: "ค่าพนักงานเพิ่มคนละเท่าไหร่",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.topicMatchedSourceIds, ["kb-staff"]);
});

Deno.test("Case G — real ghost id (not in retrieved) → handoff_source_mismatch (not topic mismatch)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-ghost"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_mismatch");
});

Deno.test("Case H — handoff-sounding wording in answer + Structured keep → resolver MUST ignore wording", () => {
  // The `answer` text contains handoff-sounding words but Structured Decision
  // is answer_from_source with a topic-matching source. Resolver must keep.
  // (Explicit anti-regression: no post-answer wording detection allowed.)
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      answer: "ขออนุญาตเช็กข้อมูลกับแอดมินก่อนนะคะ",  // <-- wording that resembles fallback
      business_data_decision: "answer_from_source",
      business_data_category: "addon",
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "เพิ่มรายการอาหารเท่าไหร่",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.reason, "answer_from_source");
});

Deno.test("Non-business question with retrieved sources present → keep (no topic check triggers)", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "not_applicable" },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "สวัสดีค่ะ",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.reason, "not_applicable");
});

Deno.test("Delivery question, only add-on food source → topic mismatch", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-addon-food"],
    },
    retrievedSources: [KB_ADDON_FOOD],
    messageText: "ค่าส่งต่างจังหวัดคิดเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_topic_mismatch");
});

Deno.test("Delivery question with delivery source → keep", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_category: "delivery_fee",
      business_data_source_ids: ["kb-delivery"],
    },
    retrievedSources: [KB_DELIVERY],
    messageText: "ค่าส่งต่างจังหวัดคิดเท่าไหร่",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.topicMatchedSourceIds, ["kb-delivery"]);
});

Deno.test("Anti-regression — no post-answer wording detection: file MUST NOT scan answer text for handoff keywords", async () => {
  // Structural guarantee: the resolver source must not contain any of these
  // wording-detection patterns applied to `answer` / `rawParsed.answer`.
  const src = await Deno.readTextFile(new URL("./business-data-handoff.ts", import.meta.url));
  const FORBIDDEN = [
    /answer[^\n]*\.(includes|match|test|search)\(/,
    /\.answer\s*\.(includes|match|test|search)\(/,
    /เช็กกับแอดมิน/,
    /ประสาน(ทีมงาน|แอดมิน)/,
    /ตรวจสอบให้/,
    /ขออนุญาตเช็ก/,
    /เดี๋ยวแอดมินตอบ/,
  ];
  // The FALLBACK constant is defined here — allow occurrences ONLY inside that
  // constant definition. Strip that line before scanning.
  const scanned = src.replace(/export const BUSINESS_DATA_FALLBACK_TEXT[\s\S]*?;\n/, "");
  for (const re of FORBIDDEN) {
    const m = scanned.match(re);
    if (m) throw new Error(`Forbidden wording-detection pattern found: ${re} → ${m[0]}`);
  }
});

Deno.test("Legacy parity — id-only input preserves prior behavior for pricing-only question", () => {
  // Pure pricing question ("ราคาเท่าไหร่") has no topic category → topic
  // check is skipped for both legacy and rich-source paths → both keep.
  const a = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-1"],
    },
    retrievedSourceIds: ["kb-1"],
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(a.action, "keep");

  const b = resolveBusinessDataHandoff({
    rawParsed: {
      business_data_decision: "answer_from_source",
      business_data_source_ids: ["kb-1"],
    },
    retrievedSources: [{ id: "kb-1", text: "" }],
    messageText: "ราคาต่อโต๊ะเท่าไหร่",
  });
  assertEquals(b.action, "keep");
});
