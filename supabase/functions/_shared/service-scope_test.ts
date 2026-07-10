// Patch 2.1 — deterministic tests for service_scope drift guard
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectFoodOnlyPhrase,
  detectFullServiceSwitchPhrase,
  resolveServiceScope,
  buildServiceScopeLockPrompt,
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
  assertEquals(p.includes("ห้ามเสนอ/พูดถึงแพ็กเกจ"), true);
  assertEquals(p.includes("จำนวนแขก(พระ)"), true);
});

Deno.test("lock prompt: null → empty string (no injection)", () => {
  assertEquals(buildServiceScopeLockPrompt(null), "");
});
