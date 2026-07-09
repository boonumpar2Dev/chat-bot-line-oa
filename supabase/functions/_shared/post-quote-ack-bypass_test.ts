// Patch 1.1 Fix 1 — narrow bypass of manual_chat_until for post-quote low-info ack
// Pure decision-function tests mirroring the inline logic in line-webhook/index.ts (lines 764-796)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPostQuoteContext, isLowInfoAck } from "./ai-policy.ts";

type Conv = { sender: string; message: string };

function decide(
  status: string,
  convs: Conv[],
  msg: string,
  manualUntilFuture: boolean,
  msgType?: string,
  aiEnabled = true,
): "send_canned" | "suppress_already_sent" | "skip_manual_pause" | "allow_normal_flow" {
  if (!manualUntilFuture) return "allow_normal_flow"; // outside pause → normal path (guard at line 857 still applies)
  if (!aiEnabled) return "skip_manual_pause";
  const isPQ = isPostQuoteContext(status, convs);
  const isAck = isLowInfoAck(msg, { messageType: msgType });
  if (isPQ && isAck) {
    const already = convs.some(m => m.sender === "ai" && m.message.includes("หากมีคำถามเพิ่มเติม สอบถามได้ตลอด"));
    return already ? "suppress_already_sent" : "send_canned";
  }
  return "skip_manual_pause";
}

Deno.test("1) pending_confirm + pause active + 'ขอบคุณค่ะ ขอดูก่อนนะคะ' → send canned once", () => {
  assertEquals(decide("pending_confirm", [], "ขอบคุณค่ะ ขอดูก่อนนะคะ", true), "send_canned");
});

Deno.test("2) pending_confirm + pause active + real question → skip manual pause (no bypass)", () => {
  assertEquals(decide("pending_confirm", [], "ยอดนี้รวมโต๊ะเก้าอี้ไหมคะ", true), "skip_manual_pause");
});

Deno.test("3) new/inquiry + pause active + 'ขอบคุณค่ะ' → NO bypass (not post-quote)", () => {
  assertEquals(decide("new", [{ sender: "customer", message: "ขอบคุณค่ะ" }], "ขอบคุณค่ะ", true), "skip_manual_pause");
});

Deno.test("4) post-quote + low-info ack + canned already sent in round → suppress", () => {
  const convs: Conv[] = [
    { sender: "admin", message: "แนบใบเสนอราคาให้ค่ะ" },
    { sender: "ai", message: "หากมีคำถามเพิ่มเติม สอบถามได้ตลอดเลยนะคะ 🙏" },
  ];
  assertEquals(decide("pending_confirm", convs, "ขอบคุณค่ะ", true), "suppress_already_sent");
});

Deno.test("5) post-quote + low-info ack + pause INACTIVE → allow normal flow (guard@857 handles)", () => {
  assertEquals(decide("pending_confirm", [], "ขอบคุณค่ะ", false), "allow_normal_flow");
});

Deno.test("6) sticker in post-quote + pause active → send canned once", () => {
  assertEquals(decide("pending_confirm", [], "", true, "sticker"), "send_canned");
});

Deno.test("7) ai_enabled=false during pause + post-quote ack → still skip (respect master switch)", () => {
  assertEquals(decide("pending_confirm", [], "ขอบคุณค่ะ", true, undefined, false), "skip_manual_pause");
});

Deno.test("8) long real request during pause → no bypass", () => {
  assertEquals(decide("pending_confirm", [], "ขอเปลี่ยนวันจัดงานเป็น 20 ก.ค. ได้ไหมคะ", true), "skip_manual_pause");
});
