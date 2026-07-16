import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectPackageIntent, resolveSelectedPackage, categoryMatchesPackageType } from "./package-intent.ts";

Deno.test("all-package intent — ขอดูทุกรูปแบบ", () => {
  const r = detectPackageIntent("ขอดูทุกรูปแบบค่ะ");
  assertEquals(r.scope, "all");
});

Deno.test("all-package intent — ทั้ง 3 แบบมีอะไรบ้าง", () => {
  const r = detectPackageIntent("ทั้ง 3 แบบมีอะไรบ้างคะ");
  assertEquals(r.scope, "all");
  assertEquals(r.factualInfo, true);
});

Deno.test("all-package intent — 3 แบบ", () => {
  const r = detectPackageIntent("3 แบบมีอะไรบ้างคะ");
  assertEquals(r.scope, "all");
});

Deno.test("all-package intent — ขอครบทุกแบบ", () => {
  assertEquals(detectPackageIntent("ขอครบทุกแบบค่ะ").scope, "all");
  assertEquals(detectPackageIntent("ขอรายละเอียดทุกแบบค่ะ").scope, "all");
});

Deno.test("specific type — buffet only", () => {
  const r = detectPackageIntent("ขอดูรายละเอียดบุฟเฟ่ต์ค่ะ");
  assertEquals(r.scope, "specific");
  assertEquals(r.specificType, "buffet");
});

Deno.test("specific type — โต๊ะจีน", () => {
  assertEquals(detectPackageIntent("แพ็กโต๊ะจีนมีอะไรบ้าง").specificType, "chinese");
});

Deno.test("specific type — ซุ้มอาหาร", () => {
  assertEquals(detectPackageIntent("อยากทราบซุ้มอาหารค่ะ").specificType, "station");
});

Deno.test("selected — ในแพ็กที่เลือกมีอะไรบ้าง", () => {
  const r = detectPackageIntent("ในแพ็กที่เลือกมีอะไรบ้างคะ");
  assertEquals(r.scope, "selected");
  assertEquals(r.factualInfo, true);
});

Deno.test("factualInfo present without action verb", () => {
  const r = detectPackageIntent("ทั้ง 3 แบบเลยได้ไหมคะ อยากทราบรายละเอียดค่ะ");
  assertEquals(r.factualInfo, true);
  assertEquals(r.currentJobAction, false);
});

Deno.test("currentJobAction — เปลี่ยนเมนู", () => {
  const r = detectPackageIntent("เปลี่ยนเมนูได้ไหมคะ");
  assertEquals(r.currentJobAction, true);
});

Deno.test("currentJobAction — ปรับเป็นแพ็ก 60 ท่าน", () => {
  assertEquals(detectPackageIntent("ช่วยปรับเป็นแพ็ก 60 ท่านในใบเสนอราคาให้หน่อยค่ะ").currentJobAction, true);
});

Deno.test("currentJobAction — เอาตามเดิม", () => {
  assertEquals(detectPackageIntent("เอารายการอาหารเดิมได้ไหมคะ").currentJobAction, true);
});

Deno.test("resolveSelectedPackage — from intent_data.service_type", () => {
  const r = resolveSelectedPackage({
    message: "ในแพ็กเกจที่เลือกมีอะไรบ้างคะ",
    serviceType: "บุฟเฟ่ต์",
  });
  assertEquals(r, "buffet");
});

Deno.test("resolveSelectedPackage — explicit wins over stored", () => {
  const r = resolveSelectedPackage({
    message: "ซุ้มอาหารมีอะไรบ้าง",
    serviceType: "บุฟเฟ่ต์",
  });
  assertEquals(r, "station");
});

Deno.test("resolveSelectedPackage — ambiguous history", () => {
  const r = resolveSelectedPackage({
    message: "ในแพ็กเกจที่เลือกมีอะไรบ้างคะ",
    recentHistoryText: "ลูกค้า: อยากรู้บุฟเฟ่ต์ค่ะ\nAI: โต๊ะจีนก็น่าสนใจนะคะ",
  });
  assertEquals(r, "ambiguous");
});

Deno.test("resolveSelectedPackage — nothing resolvable", () => {
  assertEquals(resolveSelectedPackage({ message: "ในแพ็กเกจที่เลือกมีอะไรบ้างคะ" }), null);
});

Deno.test("categoryMatchesPackageType", () => {
  assertEquals(categoryMatchesPackageType("บุฟเฟ่ต์งานบวช", "buffet"), true);
  assertEquals(categoryMatchesPackageType("โต๊ะจีน", "chinese"), true);
  assertEquals(categoryMatchesPackageType("ซุ้มอาหารมงคล", "station"), true);
  assertEquals(categoryMatchesPackageType("บุฟเฟ่ต์งานบวช", "chinese"), false);
});
