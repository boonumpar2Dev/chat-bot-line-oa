// Deterministic date anchor + Thai date parser tests.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseThaiDateCandidates } from "../_shared/ai-policy.ts";
import { resolveDateAnchor } from "./index.ts";

const Y = 2026;

Deno.test("parse Thai full month + BE 2-digit year", () => {
  const r = parseThaiDateCandidates("25 กค 69", { todayYear: Y });
  assertEquals(r.length, 1);
  assertEquals(r[0].isoDate, "2026-07-25");
});

Deno.test("parse Thai month with dots ก.ค.", () => {
  const r = parseThaiDateCandidates("25 ก.ค. 69", { todayYear: Y });
  assert(r.some(x => x.isoDate === "2026-07-25"));
});

Deno.test("parse short forms กค / สค / ก.ค / ส.ค.", () => {
  const cases = ["10 กค 69", "10 ก.ค 69", "10 ส.ค. 69", "10 สค 69"];
  const isos = cases.map(c => parseThaiDateCandidates(c, { todayYear: Y })[0]?.isoDate);
  assertEquals(isos, ["2026-07-10", "2026-07-10", "2026-08-10", "2026-08-10"]);
});

Deno.test("parse nickname 'เบียร์25กค69' → 2026-07-25", () => {
  const r = parseThaiDateCandidates("เบียร์25กค69", { todayYear: Y });
  assert(r.some(x => x.isoDate === "2026-07-25"));
});

Deno.test("parse filename 6-digit DDMMYY 25072569 → 2026-07-25", () => {
  const r = parseThaiDateCandidates("quote_25072569.pdf", { todayYear: Y });
  assert(r.some(x => x.isoDate === "2026-07-25"));
});

Deno.test("parse slash 25/07/69 → 2026-07-25", () => {
  const r = parseThaiDateCandidates("25/07/69", { todayYear: Y });
  assert(r.some(x => x.isoDate === "2026-07-25"));
});

// ---- resolveDateAnchor ----

Deno.test("anchor: customer says '25 กค' + admin no date → high, 2026-07-25", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: "อยากจัด 25 กค 69 ค่ะ" },
    ],
    nickname: null,
    storedEventDate: "2026-08-02",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-07-25");
  assertEquals(r.confidence, "high");
});

Deno.test("anchor: assistant hallucination 02/08/2026 IGNORED, customer explicit wins", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: "25 กค นะครับ" },
      { sender: "ai", message: "รับทราบวันที่ 02/08/2026 ค่ะ" }, // must be ignored
      { sender: "customer", message: "วันที่ 25 นะครับ" }, // day-only reaffirm
    ],
    nickname: "เบียร์25กค69",
    storedEventDate: "2026-08-02",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-07-25");
  assertEquals(r.confidence, "high");
  assert(r.hasDayOnly);
});

Deno.test("anchor: day-only only, no explicit customer/admin month, nickname carries → medium", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: "วันที่ 25 นะครับ" },
    ],
    nickname: "เบียร์25กค69",
    storedEventDate: "2026-08-02",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-07-25");
  assertEquals(r.confidence, "medium");
});

Deno.test("anchor: ambiguous — no evidence, only stored → low, keep stored", () => {
  const r = resolveDateAnchor({
    messages: [{ sender: "customer", message: "วันที่ 25 นะครับ" }],
    nickname: null,
    storedEventDate: "2026-08-02",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-08-02");
  assertEquals(r.confidence, "low");
});

Deno.test("anchor: conflict — customer says July, admin confirms August", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: "25 กค 69" },
      { sender: "admin", message: "รับ 25 สค 69 นะครับ" },
    ],
    nickname: null,
    storedEventDate: null,
    todayYear: Y,
  });
  assertEquals(r.confidence, "conflict");
});

Deno.test("anchor: filename evidence 25072569 supports July when stored says August", () => {
  const r = resolveDateAnchor({
    messages: [
      { sender: "customer", message: "ตามไฟล์ quote_25072569.pdf ค่ะ" },
    ],
    nickname: null,
    storedEventDate: "2026-08-25",
    todayYear: Y,
  });
  assertEquals(r.proposedIso, "2026-07-25");
  assertEquals(r.confidence, "high");
});
