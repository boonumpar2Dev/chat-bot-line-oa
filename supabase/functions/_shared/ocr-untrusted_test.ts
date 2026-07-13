// Tests for stripImageOcrBlocks + OCR-untrusted date behavior.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripImageOcrBlocks, parseThaiDateCandidates, buildDateEvidenceBlock } from "./ai-policy.ts";

const OCR_HEADER = "[รูปภาพ]\n📎 https://example.com/x.jpg\n📄 เนื้อหาในรูป:\n";

Deno.test("stripImageOcrBlocks: no marker → passthrough", () => {
  assertEquals(stripImageOcrBlocks("สวัสดีค่ะ วันที่ 20 ต.ค. 2569"), "สวัสดีค่ะ วันที่ 20 ต.ค. 2569");
});

Deno.test("stripImageOcrBlocks: image-only OCR message → strip whole tail, keep [รูปภาพ] header", () => {
  const input = `${OCR_HEADER}โพสต์วันที่ 02/10/2025 สนใจมั้ยครับ`;
  const out = stripImageOcrBlocks(input);
  assertEquals(out, "[รูปภาพ]\n📎 https://example.com/x.jpg");
});

Deno.test("stripImageOcrBlocks: customer text before OCR block → keep customer text", () => {
  const input = `สนใจแบบนี้ค่ะ งานวันที่ 20 ตุลาคม 2569\n📄 เนื้อหาในรูป:\nโพสต์วันที่ 02/10/2025`;
  const out = stripImageOcrBlocks(input);
  assertEquals(out, "สนใจแบบนี้ค่ะ งานวันที่ 20 ตุลาคม 2569");
});

Deno.test("stripImageOcrBlocks: idempotent", () => {
  const input = `hello\n📄 เนื้อหาในรูป:\n25/07/2569`;
  const once = stripImageOcrBlocks(input);
  const twice = stripImageOcrBlocks(once);
  assertEquals(once, twice);
});

Deno.test("stripImageOcrBlocks: empty/null-ish → safe", () => {
  assertEquals(stripImageOcrBlocks(""), "");
  // @ts-ignore intentional
  assertEquals(stripImageOcrBlocks(null), "");
});

Deno.test("after strip: OCR-only image with a date has zero date candidates", () => {
  const input = `${OCR_HEADER}02/10/2025 งานตัวอย่าง`;
  const stripped = stripImageOcrBlocks(input);
  const cands = parseThaiDateCandidates(stripped, { todayYear: 2026 });
  assertEquals(cands.length, 0);
});

Deno.test("after strip: customer typed date preserved, OCR date ignored", () => {
  const input = `งาน 20 ตุลาคม 2569 ค่ะ\n📄 เนื้อหาในรูป:\nโพสต์วันที่ 02/10/2025`;
  const stripped = stripImageOcrBlocks(input);
  const cands = parseThaiDateCandidates(stripped, { todayYear: 2026 });
  assert(cands.some(c => c.isoDate === "2026-10-20"));
  assert(!cands.some(c => c.isoDate === "2025-10-02"));
});

Deno.test("buildDateEvidenceBlock: mentions OCR untrusted", () => {
  const s = buildDateEvidenceBlock();
  assert(s.includes("OCR"));
  assert(s.includes("untrusted"));
});
