// Deno tests for resolveAiReplyPolicy — Phase 1
// รันด้วย supabase--test_edge_functions
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveAiReplyPolicy } from "./ai-policy.ts";

const NOW = new Date("2026-07-02T10:00:00Z");
const ctx = { now: NOW };

Deno.test("flag=false: ai_active=true, no mute → canReply=true, legacy=true", () => {
  const p = resolveAiReplyPolicy(
    { ai_active: true, manual_chat_until: null },
    { advanced_ai_status_policy_enabled: false },
    ctx,
  );
  assertEquals(p.canReply, true);
  assertEquals(p.legacy, true);
  assertEquals(p.replyMode, "legacy");
  assertEquals(p.shouldSyncContext, false);
  assertEquals(p.shouldCreateAdminTask, false);
});

Deno.test("flag=false: ai_active=false → canReply=false", () => {
  const p = resolveAiReplyPolicy(
    { ai_active: false, manual_chat_until: null },
    { advanced_ai_status_policy_enabled: false },
    ctx,
  );
  assertEquals(p.canReply, false);
  assertEquals(p.legacy, true);
});

Deno.test("flag=false: manual_chat_until in future → canReply=false", () => {
  const future = new Date(NOW.getTime() + 5 * 60000).toISOString();
  const p = resolveAiReplyPolicy(
    { ai_active: true, manual_chat_until: future },
    { advanced_ai_status_policy_enabled: false },
    ctx,
  );
  assertEquals(p.canReply, false);
});

Deno.test("flag=false: manual_chat_until in past → canReply=true", () => {
  const past = new Date(NOW.getTime() - 5 * 60000).toISOString();
  const p = resolveAiReplyPolicy(
    { ai_active: true, manual_chat_until: past },
    { advanced_ai_status_policy_enabled: false },
    ctx,
  );
  assertEquals(p.canReply, true);
});

Deno.test("flag=undefined (missing) treated as false → legacy=true", () => {
  const p = resolveAiReplyPolicy(
    { ai_active: true },
    {},
    ctx,
  );
  assertEquals(p.legacy, true);
  assertEquals(p.canReply, true);
});

Deno.test("flag=true: still uses legacy guard in Phase 1 stub, but legacy=false marker", () => {
  const p = resolveAiReplyPolicy(
    { ai_active: true, manual_chat_until: null },
    { advanced_ai_status_policy_enabled: true },
    ctx,
  );
  assertEquals(p.canReply, true);
  assertEquals(p.legacy, false);
  assertEquals(p.replyMode, "legacy");
});

Deno.test("flag=true + muted: canReply=false (legacy guard still applies)", () => {
  const future = new Date(NOW.getTime() + 60000).toISOString();
  const p = resolveAiReplyPolicy(
    { ai_active: true, manual_chat_until: future },
    { advanced_ai_status_policy_enabled: true },
    ctx,
  );
  assertEquals(p.canReply, false);
  assertEquals(p.legacy, false);
});

Deno.test("null ai_active treated as true (schema default)", () => {
  const p = resolveAiReplyPolicy(
    { ai_active: null, manual_chat_until: null },
    { advanced_ai_status_policy_enabled: false },
    ctx,
  );
  assertEquals(p.canReply, true);
});
