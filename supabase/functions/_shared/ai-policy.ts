// AI Policy Layer — Phase 1 (Stub / Legacy-preserving)
//
// 🎯 Goal:
//   Pure function ที่รับ customer + settings + context → คืน policy สำหรับ AI ตอบ
//
// 🛡️ Guarantees (Phase 1):
//   1. **Pure**: ห้ามอ่าน/เขียน database, ห้ามเรียก AI, ห้าม side effect ใดๆ
//   2. **Legacy-preserving**: ถ้า `advanced_ai_status_policy_enabled` = false
//      → คืน policy ที่สะท้อน legacy guard เดิม (ai_active + manual_chat_until เท่านั้น)
//   3. **No status mutation**: ห้ามคืน field ที่บอกให้เปลี่ยน status ลูกค้า
//   4. **Not wired yet**: Phase 1 ยังไม่ hook เข้า line-webhook — เป็นแค่โครงพร้อมทดสอบ
//
// 📖 Usage (จะทำใน Phase ต่อไป):
//   const policy = resolveAiReplyPolicy(customer, cfg, ctx);
//   if (!policy.canReply) return; // no-op เมื่อ flag=false ก็จะเหมือน legacy guard
//
// Phase 2 ขึ้นไปจะเพิ่ม logic status-aware / lifecycle จริง — Phase 1 stub เท่านั้น

export type ReplyMode =
  | "legacy"           // flag=false → ใช้ prompt/behavior เดิมทั้งหมด
  | "new_customer"
  | "general_info"
  | "care_mode"
  | "repeat_booking"
  | "handoff_only"
  | "manual_paused";

export type Lifecycle =
  | "legacy"           // flag=false
  | "new"
  | "pending_confirm"
  | "confirmed"
  | "postponed"
  | "completed_recent"
  | "completed_warm"
  | "completed_old"
  | "completed_unknown";

export type RiskLevel = "low" | "medium" | "high";

export interface AiReplyPolicy {
  /** AI ควรตอบลูกค้าไหม (สะท้อน legacy guard ai_active + manual_chat_until เมื่อ flag=false) */
  canReply: boolean;
  replyMode: ReplyMode;
  lifecycle: Lifecycle;
  /** จะใช้ใน Phase 3 (Manual Context Sync) — Phase 1 คืน false ตลอด */
  shouldSyncContext: boolean;
  /** จะใช้ใน Phase 5 (Admin Action Task) — Phase 1 คืน false ตลอด */
  shouldCreateAdminTask: boolean;
  handoffReason: string | null;
  riskLevel: RiskLevel;
  reason: string;
  /** true = policy layer ปิดอยู่ (flag=false) → caller ควรใช้ legacy path เดิม 100% */
  legacy: boolean;
}

export interface CustomerLike {
  id?: string;
  status?: string | null;
  ai_active?: boolean | null;
  manual_chat_until?: string | null;
  admin_bot_override?: boolean | null;
  customer_origin?: string | null;
}

export interface AppSettingsLike {
  advanced_ai_status_policy_enabled?: boolean | null;
  ai_policy_config?: Record<string, unknown> | null;
  manual_chat_minutes?: number | null;
  manual_chat_hours?: number | null;
}

export interface MessageContextLike {
  // reserved for future phases (recent messages, summary, etc.)
  now?: Date;
}

/**
 * Phase 1 stub — legacy-preserving.
 *
 * เมื่อ flag=false (default): คืน policy ที่ mirrors legacy guard เดิมใน line-webhook line 761-762
 *   - canReply = ai_active && (manual_chat_until เป็น null หรือหมดเวลาแล้ว)
 *   - ทุก field อื่น = "legacy" / false → caller ต้องใช้ path เดิม
 *
 * เมื่อ flag=true: Phase 1 ยังไม่ implement — คืนค่า placeholder ที่ยังคง legacy guard เดิมไว้
 *   (Phase 2+ จะเพิ่ม status-aware logic ที่นี่)
 */
export function resolveAiReplyPolicy(
  customer: CustomerLike,
  settings: AppSettingsLike,
  _ctx: MessageContextLike = {},
): AiReplyPolicy {
  const now = _ctx.now ?? new Date();
  const flagOn = settings.advanced_ai_status_policy_enabled === true;

  // Legacy guard (สะท้อน line-webhook line 761-762 เป๊ะๆ):
  //   if (!ai_active) return;
  //   if (manual_chat_until && new Date(manual_chat_until) > new Date()) return;
  const aiActive = customer.ai_active !== false; // null/undefined = default true ตาม schema
  const mutedUntil = customer.manual_chat_until ? new Date(customer.manual_chat_until) : null;
  const isMuted = mutedUntil !== null && mutedUntil.getTime() > now.getTime();
  const legacyCanReply = aiActive && !isMuted;

  if (!flagOn) {
    return {
      canReply: legacyCanReply,
      replyMode: "legacy",
      lifecycle: "legacy",
      shouldSyncContext: false,
      shouldCreateAdminTask: false,
      handoffReason: null,
      riskLevel: "low",
      reason: legacyCanReply
        ? "legacy: ai_active && !muted"
        : `legacy: ${!aiActive ? "ai_active=false" : "manual_chat_until active"}`,
      legacy: true,
    };
  }

  // Flag=true → Phase 1 stub: ยังคง legacy guard ไว้ก่อน แต่ marker legacy=false
  // เพื่อให้ Phase 2 ค่อยเติม status-aware logic ที่นี่โดยไม่แตะ legacy path
  return {
    canReply: legacyCanReply,
    replyMode: "legacy",
    lifecycle: "legacy",
    shouldSyncContext: false,
    shouldCreateAdminTask: false,
    handoffReason: null,
    riskLevel: "low",
    reason: "phase1-stub: advanced flag on but status-aware logic not implemented yet",
    legacy: false,
  };
}
