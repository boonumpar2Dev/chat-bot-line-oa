// Tests for Existing-Cycle Post-AI Enforcement — Phase 3.1 surgical fix.
// Validates that soft "ได้เลยค่ะ" openers followed by factual discovery content
// are NOT false-positive'd as fake approval, while strong action claims still
// trigger handoff.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceExistingCyclePolicy } from "./existing-cycle-post-enforcement.ts";

const base = {
  existingCycleMode: true,
  explicitNewCycle: false,
};

Deno.test("Discovery: 'ทั้ง 3 แบบเลยได้ไหมคะ อยากทราบค่ะ' + factual reply → keep", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "ทั้ง 3 แบบเลยได้ไหมคะ อยากทราบค่ะ",
    rawAnswer: "ได้เลยค่ะ สำหรับแขก 50 ท่าน มีให้เลือก 3 รูปแบบ ได้แก่ บุฟเฟ่ต์ โต๊ะจีน และซุ้มอาหารค่ะ",
  });
  assertEquals(res.action, "keep");
  assertEquals(res.disableAi, false);
});

Deno.test("Discovery: 'ขอรายละเอียดทั้ง 3 แบบค่ะ' + explanation → keep", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "ขอรายละเอียดทั้ง 3 แบบค่ะ",
    rawAnswer: "ได้ค่ะ แต่ละแบบประกอบด้วยเมนูหลัก 5 อย่าง ราคาเริ่มต้น 350 บาทต่อท่านค่ะ",
  });
  assertEquals(res.action, "keep");
});

Deno.test("Action: 'เพิ่มทั้ง 3 แบบลงใบเสนอราคาให้เลยค่ะ' + 'เพิ่มให้แล้ว' → replace_handoff", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "งั้นเพิ่มทั้ง 3 แบบลงใบเสนอราคาให้เลยค่ะ",
    rawAnswer: "ได้เลยค่ะ เพิ่มให้แล้วนะคะ",
  });
  assertEquals(res.action, "replace_handoff");
  assertEquals(res.disableAi, true);
  assertEquals(res.suppressMedia, true);
});

Deno.test("Discovery: 'เมนูเดิมมีอะไรบ้างคะ' + factual list → keep", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "เมนูเดิมมีอะไรบ้างคะ",
    rawAnswer: "เมนูเดิมประกอบด้วย ต้มยำกุ้ง ผัดไทย ข้าวผัดปู และของหวานค่ะ",
  });
  assertEquals(res.action, "keep");
});

Deno.test("Action: 'ใช้เมนูเดิมได้เลยไหมคะ' + 'เมนูเดิมยังใช้ได้ค่ะ' → replace_handoff (strong)", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "ใช้เมนูเดิมได้เลยไหมคะ",
    rawAnswer: "เมนูเดิมยังใช้ได้เลยค่ะ",
  });
  assertEquals(res.action, "replace_handoff");
  assertEquals(res.disableAi, true);
});

Deno.test("Bare soft opener + approval intent + no discovery → replace_handoff", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "เปลี่ยนได้ไหมคะ",
    rawAnswer: "ได้เลยค่ะ",
  });
  assertEquals(res.action, "replace_handoff");
});

Deno.test("Fake completion (unconditional) → replace_handoff", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "อะไรก็ได้ค่ะ",
    rawAnswer: "ดำเนินการให้แล้วเรียบร้อยแล้วนะคะ",
  });
  assertEquals(res.action, "replace_handoff");
});

Deno.test("Existing-cycle mode OFF → keep regardless", () => {
  const res = enforceExistingCyclePolicy({
    existingCycleMode: false,
    explicitNewCycle: false,
    messageText: "เปลี่ยนได้ไหม",
    rawAnswer: "ได้เลยค่ะ เปลี่ยนให้แล้ว",
  });
  assertEquals(res.action, "keep");
});

Deno.test("Discovery intent overrides even bare opener", () => {
  const res = enforceExistingCyclePolicy({
    ...base,
    messageText: "แต่ละแบบต่างกันยังไงคะ",
    rawAnswer: "ได้ค่ะ แตกต่างกันตรงจำนวนเมนูและวิธีเสิร์ฟค่ะ",
  });
  assertEquals(res.action, "keep");
});
