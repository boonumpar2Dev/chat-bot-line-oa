// Tests for AI-reply-per-turn lock decision (Patch 1 - B)
// Pure decision function that mirrors the webhook logic.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function shouldSkipDuplicate(args: {
  customerMsgTs: string | null;
  aiRepliesAfter: string[]; // created_at strings of AI replies after customerMsgTs and within 60s
  now: Date;
}): boolean {
  const { customerMsgTs, aiRepliesAfter, now } = args;
  if (!customerMsgTs) return false;
  const sixtySecAgo = new Date(now.getTime() - 60_000).toISOString();
  const cutoff = customerMsgTs > sixtySecAgo ? customerMsgTs : sixtySecAgo;
  return aiRepliesAfter.some((t) => t >= cutoff);
}

const NOW = new Date("2026-07-09T10:00:00Z");

Deno.test("no prior AI reply → not skipped", () => {
  assertEquals(shouldSkipDuplicate({
    customerMsgTs: new Date(NOW.getTime() - 10_000).toISOString(),
    aiRepliesAfter: [],
    now: NOW,
  }), false);
});

Deno.test("AI reply already exists 5s after customer msg → SKIP duplicate", () => {
  const custTs = new Date(NOW.getTime() - 10_000).toISOString();
  const aiTs = new Date(NOW.getTime() - 5_000).toISOString();
  assertEquals(shouldSkipDuplicate({ customerMsgTs: custTs, aiRepliesAfter: [aiTs], now: NOW }), true);
});

Deno.test("AI reply older than 60s window → not skipped (new turn)", () => {
  const custTs = new Date(NOW.getTime() - 5_000).toISOString();
  const aiTs = new Date(NOW.getTime() - 120_000).toISOString(); // 2 minutes old
  assertEquals(shouldSkipDuplicate({ customerMsgTs: custTs, aiRepliesAfter: [aiTs], now: NOW }), false);
});

Deno.test("no customer msg ts → not skipped (fail-open)", () => {
  assertEquals(shouldSkipDuplicate({ customerMsgTs: null, aiRepliesAfter: [], now: NOW }), false);
});

Deno.test("cutoff uses customerMsgTs when it is newer than 60s ago", () => {
  // customer msg 3s ago, AI reply 10s ago (before customer msg) → not skipped
  const custTs = new Date(NOW.getTime() - 3_000).toISOString();
  const aiTs = new Date(NOW.getTime() - 10_000).toISOString();
  assertEquals(shouldSkipDuplicate({ customerMsgTs: custTs, aiRepliesAfter: [aiTs], now: NOW }), false);
});
