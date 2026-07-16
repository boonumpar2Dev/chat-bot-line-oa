import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceExistingCyclePolicy } from "./existing-cycle-post-enforcement.ts";

Deno.test("Defect 3 — factual 'ได้ไหม' should NOT handoff", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ได้เลยค่ะ สำหรับแขก 50 ท่าน มีให้เลือก 3 รูปแบบ ได้แก่ บุฟเฟ่ต์ โต๊ะจีน และซุ้มอาหารค่ะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "ทั้ง 3 แบบเลยได้ไหมคะ อยากทราบรายละเอียดค่ะ",
  });
  assertEquals(r.action, "keep");
  assertEquals(r.disableAi, false);
  assertEquals(r.suppressMedia, false);
});

Deno.test("Defect 3 — real menu change WITH completion claim → handoff", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ได้เลยค่ะ เปลี่ยนให้แล้วนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "เปลี่ยนเมนูได้ไหมคะ",
  });
  assertEquals(r.action, "replace_handoff");
  assertEquals(r.disableAi, true);
  assertEquals(r.suppressMedia, true);
});

Deno.test("Defect 3 — real quotation adjustment → handoff", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "จัดให้เรียบร้อยแล้วค่ะ เพิ่มลงใบเสนอราคาแล้วนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "ช่วยปรับเป็นแพ็ก 60 ท่านในใบเสนอราคาให้หน่อยค่ะ",
  });
  assertEquals(r.action, "replace_handoff");
});

Deno.test("Defect 3 — existing-menu reuse still handoff", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "รายการเดิมใช้ได้ค่ะ ยืนยันให้แล้วนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "เอารายการอาหารเดิมได้ไหมคะ",
  });
  assertEquals(r.action, "replace_handoff");
});

Deno.test("Defect 3 — bare 'ได้เลยค่ะ' with no completion claim & no approval intent → keep", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ได้เลยค่ะ ยินดีให้บริการนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "สวัสดีค่ะ",
  });
  assertEquals(r.action, "keep");
});

Deno.test("Defect 3 — fake completion is unconditional", () => {
  const r = enforceExistingCyclePolicy({
    rawAnswer: "ยืนยันให้แล้วนะคะ",
    existingCycleMode: true,
    explicitNewCycle: false,
    messageText: "ขอบคุณค่ะ",
  });
  assertEquals(r.action, "replace_handoff");
  assertEquals(r.reasons.includes("fake_completion"), true);
});
