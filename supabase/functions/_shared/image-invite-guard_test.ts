// Tests for expanded INVITE_RE (Patch 1 - D)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const INVITE_RE = /(ลองดูรูป|ลองดูเมนู|ลองดูภาพ|ดูภาพ|ดูหน้าตา|ดูตัวอย่าง|แนบรูปให้|แนบรูป|แนบเมนู|แนบให้ด้านล่าง|ส่งรูปให้|ส่งรูป[^ก-๙a-zA-Z]{0,3}ให้|ตามนี้เลยนะคะ|ตามนี้เลยค่ะ|ตามภาพ|เลือกได้ตามนี้|ดูรูปได้|จัดเตรียม.{0,10}เมนู|ให้เลือกชม|อยู่ด้านล่าง|ดูด้านล่าง|ด้านล่างนี้|portfolio|ภาพบรรยากาศ|รูปตัวอย่าง|เมนู.{0,10}ด้านนี้|ให้ชมด้านนี้|ดูรูป.{0,10}ด้านล่าง)/i;

Deno.test("catches: จัดเตรียมเมนู...ให้เลือกชมด้านนี้", () => {
  assertEquals(INVITE_RE.test("จัดเตรียมเมนูอาหารไทยหลากหลายรายการให้เลือกชมด้านนี้เลยนะคะ"), true);
});
Deno.test("catches: แนบให้ด้านล่าง", () => {
  assertEquals(INVITE_RE.test("แนบให้ด้านล่างนะคะ"), true);
});
Deno.test("catches: ดูภาพบรรยากาศด้านล่าง", () => {
  assertEquals(INVITE_RE.test("ดูภาพบรรยากาศด้านล่างได้เลยค่ะ"), true);
});
Deno.test("catches: ส่งรูปตัวอย่างให้ชมด้านนี้", () => {
  assertEquals(INVITE_RE.test("ส่งรูปตัวอย่างให้ชมด้านนี้นะคะ"), true);
});
Deno.test("catches: ตามภาพ", () => {
  assertEquals(INVITE_RE.test("รสชาติกลมกล่อม ตามภาพนี้เลยค่ะ"), true);
});
Deno.test("catches: portfolio (case-insensitive)", () => {
  assertEquals(INVITE_RE.test("ดู Portfolio ของเราได้เลยค่ะ"), true);
});
Deno.test("does NOT catch neutral text", () => {
  assertEquals(INVITE_RE.test("สวัสดีค่ะ ยินดีให้บริการ"), false);
  assertEquals(INVITE_RE.test("รับทราบค่ะ เดี๋ยวแอดมินติดต่อกลับนะคะ"), false);
});
Deno.test("catches: แนบเมนู", () => {
  assertEquals(INVITE_RE.test("แนบเมนูมาให้ดูค่ะ"), true);
});
