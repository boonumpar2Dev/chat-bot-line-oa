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
    messageText: "ราคาเท่าไหร่คะ",
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
    messageText: "ราคาโต๊ะจีนเท่าไหร่",
  });
  assertEquals(r.action, "handoff");
  assertEquals(r.reason, "handoff_source_mismatch");
});

Deno.test("answer_from_source + all ids NOT in retrieved → handoff", () => {
  const r = resolveBusinessDataHandoff({
    rawParsed: { business_data_decision: "answer_from_source", business_data_source_ids: ["ghost-1", "ghost-2"] },
    retrievedSourceIds: KB,
    messageText: "ราคาเท่าไหร่",
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
    messageText: "ราคาเท่าไหร่",
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
    messageText: "ราคา",
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
    messageText: "ราคาเท่าไหร่",
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
    messageText: "ราคา",
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
    messageText: "ราคาเท่าไหร่",
  } as const;
  const a = resolveBusinessDataHandoff(input);
  const b = resolveBusinessDataHandoff(input);
  assertEquals(a, b);
});
