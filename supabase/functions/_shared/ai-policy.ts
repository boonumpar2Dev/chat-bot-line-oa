// AI Policy Layer — Phase 2 (lifecycle resolver + guardrails, test-customer gated)
//
// 🎯 Guarantees (Phase 2):
//   1. **Pure**: no I/O, no DB, no mutation of inputs
//   2. **Opt-in**: only injects prompt blocks when caller passes lifecycle/replyMode
//      (line-webhook decides: flag=true AND customer.id ∈ test_customer_ids)
//   3. **Fallback-safe**: any error → caller uses legacy prompt path
//   4. Phase 2 scope: lifecycle + prompt blocks only. No Admin Task / Context Sync /
//      manual pause change / auto-status change / quote-flow change.

export type ReplyMode =
  | "legacy"
  | "new_customer"
  | "general_info"
  | "care_mode"
  | "repeat_booking"
  | "handoff_only"
  | "manual_paused";

export type Lifecycle =
  | "legacy"
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
  canReply: boolean;
  replyMode: ReplyMode;
  lifecycle: Lifecycle;
  shouldSyncContext: boolean;
  shouldCreateAdminTask: boolean;
  handoffReason: string | null;
  riskLevel: RiskLevel;
  reason: string;
  legacy: boolean;
}

export interface CustomerLike {
  id?: string;
  status?: string | null;
  ai_active?: boolean | null;
  manual_chat_until?: string | null;
  admin_bot_override?: boolean | null;
  customer_origin?: string | null;
  updated_at?: string | null;
}

export interface AppSettingsLike {
  advanced_ai_status_policy_enabled?: boolean | null;
  ai_policy_config?: Record<string, unknown> | null;
  manual_chat_minutes?: number | null;
  manual_chat_hours?: number | null;
}

export interface MessageContextLike {
  now?: Date;
}

/**
 * Phase 1 legacy-preserving resolver (unchanged behavior).
 */
export function resolveAiReplyPolicy(
  customer: CustomerLike,
  settings: AppSettingsLike,
  _ctx: MessageContextLike = {},
): AiReplyPolicy {
  const now = _ctx.now ?? new Date();
  const flagOn = settings.advanced_ai_status_policy_enabled === true;

  const aiActive = customer.ai_active !== false;
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — lifecycle resolver (pure)
// ─────────────────────────────────────────────────────────────────────────────

export interface LifecycleResolveInput {
  customer: {
    status?: string | null;
    customer_origin?: string | null;
    updated_at?: string | null;
  };
  /** customer_events.event_date where status='completed' (latest) */
  latestCompletedEventDate?: string | null;
  /** customer_status_log.changed_at where new_status='completed' (latest) */
  latestCompletedStatusChangedAt?: string | null;
  config?: Record<string, unknown> | null;
  now?: Date;
}

export interface LifecycleResult {
  lifecycle: Lifecycle;
  replyMode: ReplyMode;
  /** number of days since completion when applicable */
  daysSinceCompletion: number | null;
  reason: string;
}

const DEFAULT_RECENT_DAYS = 30;
const DEFAULT_WARM_DAYS = 90;

function safeNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Pure lifecycle resolver — no I/O, no mutation.
 * Fallback chain for "completion date":
 *   1. customer_events.event_date (status='completed')
 *   2. customer_status_log.changed_at (new_status='completed')
 *   3. customers.updated_at
 *   4. none → completed_unknown
 */
export function resolveLifecycle(input: LifecycleResolveInput): LifecycleResult {
  const now = input.now ?? new Date();
  const status = (input.customer?.status ?? "").toString().toLowerCase();
  const cfg = input.config ?? {};
  const recentDays = safeNum((cfg as any).completed_recent_days, DEFAULT_RECENT_DAYS);
  const warmDays = safeNum((cfg as any).completed_warm_days, DEFAULT_WARM_DAYS);

  // Non-completed statuses → simple mapping
  if (status === "pending_confirm" || status === "pending_quote") {
    return {
      lifecycle: "pending_confirm",
      replyMode: "care_mode",
      daysSinceCompletion: null,
      reason: `status=${status}`,
    };
  }
  if (status === "confirmed" || status === "confirmed_returning") {
    return {
      lifecycle: "confirmed",
      replyMode: "care_mode",
      daysSinceCompletion: null,
      reason: `status=${status}`,
    };
  }
  if (status === "postponed") {
    return {
      lifecycle: "postponed",
      replyMode: "care_mode",
      daysSinceCompletion: null,
      reason: "status=postponed",
    };
  }
  if (status === "new" || status === "" || status === "cancelled") {
    return {
      lifecycle: "new",
      replyMode: "new_customer",
      daysSinceCompletion: null,
      reason: `status=${status || "empty"}`,
    };
  }

  // status === 'completed' (or unrecognized) → use date fallback chain
  const completionDate =
    parseDate(input.latestCompletedEventDate) ||
    parseDate(input.latestCompletedStatusChangedAt) ||
    parseDate(input.customer?.updated_at ?? null);

  if (!completionDate) {
    return {
      lifecycle: "completed_unknown",
      replyMode: "repeat_booking",
      daysSinceCompletion: null,
      reason: "completed but no date available",
    };
  }

  const days = Math.floor((now.getTime() - completionDate.getTime()) / 86400000);
  if (days <= recentDays) {
    return { lifecycle: "completed_recent", replyMode: "care_mode", daysSinceCompletion: days, reason: `completed ${days}d ≤ ${recentDays}` };
  }
  if (days <= warmDays) {
    return { lifecycle: "completed_warm", replyMode: "repeat_booking", daysSinceCompletion: days, reason: `completed ${days}d ≤ ${warmDays}` };
  }
  return { lifecycle: "completed_old", replyMode: "repeat_booking", daysSinceCompletion: days, reason: `completed ${days}d > ${warmDays}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — prompt blocks (pure strings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns Thai prompt block describing the customer's lifecycle state.
 * Returns empty string if lifecycle is "legacy" or missing.
 */
export function buildLifecycleBlock(lifecycle: Lifecycle | undefined | null): string {
  if (!lifecycle || lifecycle === "legacy") return "";
  const map: Record<Exclude<Lifecycle, "legacy">, string> = {
    new: `[LIFECYCLE:new] ลูกค้าใหม่ ยังไม่เคยจัดงาน — ทักทาย แนะนำร้านสั้นๆ แล้วถามความต้องการ (ประเภทงาน/วัน/จำนวนคน) ทีละเรื่อง`,
    pending_confirm: `[LIFECYCLE:pending_confirm] ลูกค้าอยู่ระหว่างรอยืนยัน — ห้ามยืนยันงาน/ราคา/มัดจำเอง ให้ตอบข้อมูลทั่วไปได้ ถ้าเป็นเรื่องยืนยันงานให้ประสานทีมงานต่อ`,
    confirmed: `[LIFECYCLE:confirmed] ลูกค้ายืนยันงานแล้ว — ห้ามเสนอราคาใหม่/ส่วนลด/เปลี่ยนวัน-สถานที่-จำนวนคน-เมนูเอง ให้ตอบข้อมูลทั่วไปเท่านั้น เรื่องแก้ไขงานให้ประสานทีมงาน`,
    postponed: `[LIFECYCLE:postponed] ลูกค้าเลื่อนงาน — ห้ามยืนยันวันใหม่/เงื่อนไขคืนมัดจำเอง เรื่องเลื่อน/ยกเลิก/คืนเงินให้ประสานทีมงาน`,
    completed_recent: `[LIFECYCLE:completed_recent] เพิ่งจัดงานเสร็จไม่นาน — ทักทายอบอุ่น ขอบคุณที่ใช้บริการ ถ้าถามเรื่องเก่า (บิล/ปัญหา/ร้องเรียน) ให้ประสานทีมงานทันที`,
    completed_warm: `[LIFECYCLE:completed_warm] ลูกค้าเก่ากลับมา — ทักทายแบบคุ้นเคย เริ่มเข้าเรื่องงานใหม่ได้ ห้ามอ้างส่วนลด/ราคาเดิมโดยไม่มีข้อมูล`,
    completed_old: `[LIFECYCLE:completed_old] ลูกค้าเก่านานแล้ว — ทักทายขอบคุณที่กลับมา เริ่มเข้าเรื่องงานใหม่ได้ ห้ามอ้างส่วนลด/ราคาเดิมโดยไม่มีข้อมูล`,
    completed_unknown: `[LIFECYCLE:completed_unknown] ลูกค้าเคยจัดงานแต่ไม่ทราบวันแน่ชัด — ทักทายแบบคุ้นเคย ถ้าลูกค้าอ้างงานเก่าให้ประสานทีมงานตรวจสอบ`,
  };
  return map[lifecycle as Exclude<Lifecycle, "legacy">] ?? "";
}

/**
 * High-risk guardrail block — wording chosen to match the existing handover
 * regex in line-webhook so AI's own reply triggers handover naturally.
 */
export function buildGuardrailBlock(): string {
  return `[GUARDRAIL] เรื่องต่อไปนี้ห้าม AI ตัดสิน/ยืนยันเองเด็ดขาด — ให้ตอบว่า "ขอประสานงานทีมงานให้ดูแลเรื่องนี้ต่อค่ะ 🙏" แล้วหยุด:
- ราคาที่ไม่ตรงกับแคตตาล็อก / ส่วนลดพิเศษ / มัดจำ / ใบเสนอราคา / ใบแจ้งหนี้
- เปลี่ยนวันงาน / เปลี่ยนสถานที่ / เปลี่ยนจำนวนคน / เปลี่ยนเมนู / เปลี่ยนแพ็กเกจ (สำหรับงานที่ยืนยันแล้ว)
- ยกเลิกงาน / คืนมัดจำ / คืนเงิน / เคลม / ร้องเรียน / ปัญหาคุณภาพ
- อนุมัติเงื่อนไขพิเศษ / ข้อตกลงนอกแพ็กเกจ`;
}
