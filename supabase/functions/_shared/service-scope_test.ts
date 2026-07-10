// Patch 2.1 — deterministic tests for service_scope drift guard
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectFoodOnlyPhrase,
  detectFullServiceSwitchPhrase,
  resolveServiceScope,
  buildServiceScopeLockPrompt,
  filterPackagesByScope,
  filterKbByScope,
} from "./service-scope.ts";

// ─── detectors ───────────────────────────────────────────────────────────────

Deno.test("detect: 'สั่งแต่อาหารได้ไหมคะ' → food-only", () => {
  assertEquals(detectFoodOnlyPhrase("สั่งแต่อาหารได้ไหมคะ"), true);
});
Deno.test("detect: 'อาหารอย่างเดียวได้ไหม' → food-only", () => {
  assertEquals(detectFoodOnlyPhrase("อาหารอย่างเดียวได้ไหม"), true);
});
Deno.test("detect: 'จัดพิธีเองแต่เอาอาหารจากที่ร้าน' → food-only", () => {
  assertEquals(detectFoodOnlyPhrase("จัดพิธีเองแต่เอาอาหารจากที่ร้าน"), true);
});
Deno.test("detect: 'ไม่เอาพิธีสงฆ์ค่ะ' → food-only", () => {
  assertEquals(detectFoodOnlyPhrase("ไม่เอาพิธีสงฆ์ค่ะ"), true);
});
Deno.test("detect (negative): 'สนใจจัดงานบุญค่ะ' → NOT food-only", () => {
  assertEquals(detectFoodOnlyPhrase("สนใจจัดงานบุญค่ะ"), false);
});
Deno.test("detect (negative): 'ขอเมนูอาหารหน่อย' → NOT food-only (แค่ถามเมนู)", () => {
  assertEquals(detectFoodOnlyPhrase("ขอเมนูอาหารหน่อย"), false);
});
Deno.test("detect (negative): 'มีพระ 9 รูป' → NOT food-only (แค่บอกจำนวนพระ)", () => {
  assertEquals(detectFoodOnlyPhrase("มีพระ 9 รูป"), false);
});

Deno.test("switch: 'อยากให้จัดพิธีสงฆ์ด้วยค่ะ' → full-service", () => {
  assertEquals(detectFullServiceSwitchPhrase("อยากให้จัดพิธีสงฆ์ด้วยค่ะ"), true);
});
Deno.test("switch: 'เอาแบบครบชุดเลย' → full-service", () => {
  assertEquals(detectFullServiceSwitchPhrase("เอาแบบครบชุดเลย"), true);
});
Deno.test("switch (negative): 'มีพระ 9 รูป' → NOT switch", () => {
  assertEquals(detectFullServiceSwitchPhrase("มีพระ 9 รูป"), false);
});
Deno.test("switch (negative): 'ขอเมนู' → NOT switch", () => {
  assertEquals(detectFullServiceSwitchPhrase("ขอเมนู"), false);
});

// ─── resolveServiceScope — sticky rules ──────────────────────────────────────

Deno.test("resolve #1: null + 'สั่งแต่อาหารได้ไหม' → food_only_buffet (changed)", () => {
  const r = resolveServiceScope(null, "สั่งแต่อาหารได้ไหมคะ");
  assertEquals(r.scope, "food_only_buffet");
  assertEquals(r.changed, true);
});

Deno.test("resolve #2: food_only_buffet + 'แขก 30 รวมพระ 9' → sticky food_only (no change)", () => {
  const r = resolveServiceScope("food_only_buffet", "แขก 30 รวมพระ 9 ค่ะ");
  assertEquals(r.scope, "food_only_buffet");
  assertEquals(r.changed, false);
});

Deno.test("resolve #3: food_only_buffet + ราคา ถามธรรมดา → sticky", () => {
  const r = resolveServiceScope("food_only_buffet", "ราคาเท่าไหร่คะ");
  assertEquals(r.scope, "food_only_buffet");
  assertEquals(r.changed, false);
});

Deno.test("resolve #4: food_only_buffet + 'ขอดูรูปหน่อย' → sticky", () => {
  const r = resolveServiceScope("food_only_buffet", "ขอดูรูปหน่อยค่ะ");
  assertEquals(r.scope, "food_only_buffet");
  assertEquals(r.changed, false);
});

Deno.test("resolve #5: food_only_buffet + 'พระ' คำเดี่ยว → sticky (ไม่ auto switch)", () => {
  const r = resolveServiceScope("food_only_buffet", "มีพระด้วย");
  assertEquals(r.scope, "food_only_buffet");
  assertEquals(r.changed, false);
});

Deno.test("resolve #6: food_only_buffet + 'อยากให้จัดพิธีสงฆ์ด้วย' → switch to full (changed)", () => {
  const r = resolveServiceScope("food_only_buffet", "อยากให้จัดพิธีสงฆ์ด้วยค่ะ");
  assertEquals(r.scope, "full_merit_package");
  assertEquals(r.changed, true);
});

Deno.test("resolve #7: null + 'สนใจจัดงานค่ะ' → still null (ไม่ lock ผิด)", () => {
  const r = resolveServiceScope(null, "สนใจจัดงานค่ะ");
  assertEquals(r.scope, null);
  assertEquals(r.changed, false);
});

Deno.test("resolve #8: null + 'มีพระ 9 รูป' → still null (ห้าม lock food-only จากคำว่า 'พระ')", () => {
  const r = resolveServiceScope(null, "มีพระ 9 รูปค่ะ");
  assertEquals(r.scope, null);
  assertEquals(r.changed, false);
});

// ─── prompt lock block ───────────────────────────────────────────────────────

Deno.test("lock prompt: food_only_buffet contains ห้ามพระ 9 default", () => {
  const p = buildServiceScopeLockPrompt("food_only_buffet");
  assertEquals(p.includes("SERVICE_SCOPE_LOCK = food_only_buffet"), true);
  assertEquals(p.includes("ห้าม default พระ 9"), true);
  assertEquals(p.includes("ห้ามเสนอ/พูดถึงแพ็ก"), true);
  assertEquals(p.includes("จำนวนแขก(พระ)"), true);
});

Deno.test("lock prompt: null → empty string (no injection)", () => {
  assertEquals(buildServiceScopeLockPrompt(null), "");
});

// ─── Patch 2.3 — proactive package-first behavior ────────────────────────────
Deno.test("lock prompt (food-only) instructs proactive package offer, not handoff-first", () => {
  const p = buildServiceScopeLockPrompt("food_only_buffet");
  // proactive keywords
  assertEquals(p.includes("เสนอแพ็ก food-only"), true);
  assertEquals(p.includes("ทันที"), true);
  // image title guidance
  assertEquals(p.includes("imageTitles"), true);
  assertEquals(p.includes("แพ็กเกจ: งานอาหารเท่านั้น"), true);
  // don't ask "ชอบแบบไหน" for single package
  assertEquals(p.includes("ชอบแบบไหน"), true);
  // price honesty
  assertEquals(p.includes("ห้ามแต่งราคาเอง"), true);
  // narrow handoff scope
  assertEquals(p.includes("ไม่มีใน context"), true);
});

Deno.test("lock prompt (food-only) keeps merit-package deny guard", () => {
  const p = buildServiceScopeLockPrompt("food_only_buffet");
  assertEquals(p.includes("ครบวงจร"), true);
  assertEquals(p.includes("พิธีสงฆ์"), true);
  assertEquals(p.includes("flip scope"), true);
});


// ─── Patch 2.2 — filterPackagesByScope ───────────────────────────────────────

const PKG_FOOD_A = { name: "แพ็กจัดเลี้ยงบุฟเฟต์ 30 ท่าน", category: "งานอาหาร", description: "อาหารอย่างเดียว" };
const PKG_FOOD_B = { name: "แพ็กเกจอาหาร Premium", category: "จัดเลี้ยงนอกสถานที่", description: "" };
const PKG_MERIT = { name: "งานบุญครบวงจร", category: "งานบุญ", description: "รวมพิธีสงฆ์ + อาหาร" };
const PKG_MONK = { name: "Standard พิธีสงฆ์", category: "พิธี", description: "" };
const PKG_CHINESE = { name: "โต๊ะจีน 10 ที่", category: "โต๊ะจีน", description: "" };
const PKG_UNCLASSIFIED = { name: "แพ็ก X", category: "อื่นๆ", description: "" };

Deno.test("filterPackagesByScope: food_only keeps food/buffet packages", () => {
  const out = filterPackagesByScope([PKG_FOOD_A, PKG_FOOD_B, PKG_MERIT, PKG_MONK, PKG_CHINESE], "food_only_buffet");
  assertEquals(out.length, 2);
  assertEquals(out[0].name, "แพ็กจัดเลี้ยงบุฟเฟต์ 30 ท่าน");
  assertEquals(out[1].name, "แพ็กเกจอาหาร Premium");
});

Deno.test("filterPackagesByScope: food_only denies merit/monk/chinese", () => {
  const out = filterPackagesByScope([PKG_MERIT, PKG_MONK, PKG_CHINESE], "food_only_buffet");
  assertEquals(out.length, 0);
});

Deno.test("filterPackagesByScope: food_only drops unclassified (no allow match)", () => {
  const out = filterPackagesByScope([PKG_UNCLASSIFIED], "food_only_buffet");
  assertEquals(out.length, 0);
});

Deno.test("filterPackagesByScope: null scope → passthrough (regression)", () => {
  const out = filterPackagesByScope([PKG_FOOD_A, PKG_MERIT, PKG_MONK], null);
  assertEquals(out.length, 3);
});

Deno.test("filterPackagesByScope: full_merit_package scope → passthrough (regression)", () => {
  const out = filterPackagesByScope([PKG_FOOD_A, PKG_MERIT, PKG_MONK], "full_merit_package");
  assertEquals(out.length, 3);
});

Deno.test("filterPackagesByScope: empty filter returns [] (no fallback)", () => {
  const out = filterPackagesByScope([PKG_MERIT, PKG_MONK, PKG_CHINESE], "food_only_buffet");
  assertEquals(out.length, 0);
});

// ─── Patch 2.2 — filterKbByScope ──────────────────────────────────────────────

const KB_MENU = { category: "เมนูอาหาร", title: "เมนู A" };
const KB_DELIVERY = { category: "ค่าเดินทาง", title: "ค่าขนส่ง" };
const KB_COMPANY = { category: "ข้อมูลบริษัท", title: "เกี่ยวกับเรา" };
const KB_STYLE = { category: "สไตล์การตอบ", title: "โทน" };
const KB_MONK_DETAIL = { category: "รายละเอียดพิธีสงฆ์", title: "ขั้นตอนสงฆ์" };
const KB_MERIT_EQUIP = { category: "อุปกรณ์เสริมงานบุญ", title: "อาสนะ" };
const KB_MERIT_PKG = { category: "แพ็กเกจงานบุญครบวงจร", title: "ครบวงจร" };
const KB_TIMELINE = { category: "กำหนดการพิธี", title: "timeline" };
const KB_NULL_CAT = { category: null, title: "อื่นๆ" };

Deno.test("filterKbByScope: food_only keeps menu/delivery/company/style/null-category", () => {
  const out = filterKbByScope([KB_MENU, KB_DELIVERY, KB_COMPANY, KB_STYLE, KB_NULL_CAT], "food_only_buffet");
  assertEquals(out.length, 5);
});

Deno.test("filterKbByScope: food_only denies ceremony/full-service categories", () => {
  const out = filterKbByScope([KB_MONK_DETAIL, KB_MERIT_EQUIP, KB_MERIT_PKG, KB_TIMELINE], "food_only_buffet");
  assertEquals(out.length, 0);
});

Deno.test("filterKbByScope: null scope → passthrough (regression)", () => {
  const items = [KB_MENU, KB_MONK_DETAIL, KB_MERIT_PKG];
  const out = filterKbByScope(items, null);
  assertEquals(out.length, 3);
});

Deno.test("filterKbByScope: full_merit_package → passthrough (regression)", () => {
  const items = [KB_MENU, KB_MONK_DETAIL, KB_MERIT_PKG];
  const out = filterKbByScope(items, "full_merit_package");
  assertEquals(out.length, 3);
});

