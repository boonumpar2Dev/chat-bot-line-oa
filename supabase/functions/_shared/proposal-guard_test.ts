// Deno tests for Patch 2.8 — buildNewCustomerProposalGuardBlock
// รันด้วย supabase--test_edge_functions
import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildNewCustomerProposalGuardBlock } from "./proposal-guard.ts";

const base = {
  activeScope: null as null | "food_only_buffet" | "full_merit_package",
  customerStatus: "new",
  eventType: "ทำบุญ",
  guestCount: 50,
  packageNames: ["แพ็กเกจ ก", "แพ็กเกจ ข"],
  availableImageTitles: ['"แพ็กเกจ: ก" (รูปรวม/เปรียบเทียบ)', '"แพ็กเกจ: ข" (รูปรวม/เปรียบเทียบ)'],
  prevSentImageCount: 0,
};

Deno.test("triggers for new customer with full context", () => {
  const r = buildNewCustomerProposalGuardBlock(base);
  assertEquals(r.triggered, true);
  assertStringIncludes(r.block, "ทำบุญ");
  assertStringIncludes(r.block, "50 ท่าน");
  assertStringIncludes(r.block, "แพ็กเกจ ก");
  assertStringIncludes(r.block, "ต้องใส่ image_titles อย่างน้อย 1");
});

Deno.test("skips when scope=food_only_buffet", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, activeScope: "food_only_buffet" });
  assertEquals(r.triggered, false);
  assertEquals(r.block, "");
});

Deno.test("skips when status not in {new,inquiry}", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, customerStatus: "pending_confirm" });
  assertEquals(r.triggered, false);
});

Deno.test("accepts status=inquiry", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, customerStatus: "inquiry" });
  assertEquals(r.triggered, true);
});

Deno.test("skips when event_type missing", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, eventType: null });
  assertEquals(r.triggered, false);
});

Deno.test("skips when guest_count missing/zero", () => {
  assertEquals(buildNewCustomerProposalGuardBlock({ ...base, guestCount: null }).triggered, false);
  assertEquals(buildNewCustomerProposalGuardBlock({ ...base, guestCount: 0 }).triggered, false);
});

Deno.test("skips when no packages in context", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, packageNames: [] });
  assertEquals(r.triggered, false);
});

Deno.test("skips when package images already sent earlier", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, prevSentImageCount: 2 });
  assertEquals(r.triggered, false);
});

Deno.test("no-image path: triggers but forbids image talk + image_titles=[]", () => {
  const r = buildNewCustomerProposalGuardBlock({ ...base, availableImageTitles: [] });
  assertEquals(r.triggered, true);
  assertStringIncludes(r.block, "image_titles=[]");
  assertStringIncludes(r.block, 'ห้าม**พูดว่า "ดูรูป');
});

Deno.test("config-driven: works with arbitrary package + image names (no hardcode)", () => {
  const r = buildNewCustomerProposalGuardBlock({
    ...base,
    packageNames: ["แพ็กเกจทดสอบ X"],
    availableImageTitles: ['"แพ็กเกจ: ทดสอบ X" (รูปรวม/เปรียบเทียบ)'],
  });
  assertEquals(r.triggered, true);
  assertStringIncludes(r.block, "แพ็กเกจทดสอบ X");
  assertStringIncludes(r.block, "แพ็กเกจ: ทดสอบ X");
  // ยืนยันไม่มีชื่อแพ็กเดิมโผล่มาจากที่ไหน
  assert(!r.block.includes("โต๊ะจีน"));
  assert(!r.block.includes("28,000"));
});

Deno.test("forbidden phrases explicitly listed", () => {
  const r = buildNewCustomerProposalGuardBlock(base);
  assertStringIncludes(r.block, "ชอบแนวไหน");
  assertStringIncludes(r.block, "สนใจแบบไหน");
  assertStringIncludes(r.block, "เลือกแบบไหน");
});

Deno.test("no hardcoded prices/tiers in implementation output", () => {
  const r = buildNewCustomerProposalGuardBlock(base);
  // Guard shouldn't manufacture numeric prices or tier names
  assert(!/\b(28|38|48|58)[,.]?\d{3}\b/.test(r.block), "no hardcoded price numbers");
  assert(!/\b(Silver|Gold|Platinum|Basic|Premium)\b/.test(r.block), "no fictional tier names");
});
