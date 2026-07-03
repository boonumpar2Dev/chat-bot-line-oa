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
    pending_confirm: `[LIFECYCLE:pending_confirm] ลูกค้าอยู่ระหว่างรอยืนยันงาน / รอคอนเฟิร์ม หลังจากมีการคุยรายละเอียดหรือส่งใบเสนอราคาแล้ว

หลักการตอบ:
- ให้ถือว่าลูกค้ารายนี้ไม่ใช่ลูกค้าใหม่
- ก่อนถามข้อมูลเพิ่ม ต้องอ่านประวัติการสนทนา / conversation summary / ข้อมูลลูกค้าในระบบก่อนเสมอ
- ห้ามถามข้อมูลพื้นฐานซ้ำ เช่น ประเภทงาน จังหวัด วันงาน จำนวนคน หรือสถานที่ ถ้าข้อมูลนั้นมีอยู่แล้วในระบบหรือเคยคุยในแชท
- ถ้ามีข้อมูลเดิม ให้ตอบโดยอ้างอิงบริบทเดิมอย่างสุภาพ เช่น "จากรายละเอียดที่คุยกันไว้..."
- ถ้าข้อมูลบางอย่างยังไม่ชัดจริง ๆ ให้ถามเฉพาะข้อมูลที่ขาดเท่านั้น ไม่ถามใหม่ทั้งหมด
- หากไม่แน่ใจว่าข้อมูลเดิมยังถูกต้องหรือไม่ ให้ตอบแบบระวัง หรือขอประสานงานทีมงานให้ตรวจสอบ
- ตอบข้อมูลทั่วไปได้ตามปกติ เช่น ขั้นตอนจัดงาน สิ่งที่ต้องเตรียม ระยะเวลาเตรียมงาน รายละเอียดบริการ หรือบริการเสริม
- ห้ามยืนยันคิว ราคาใหม่ มัดจำ ส่วนลด หรือแก้ไขใบเสนอราคาเอง เรื่องเหล่านี้ต้องขอประสานงานทีมงานให้ดูแลต่อ`,
    confirmed: `[LIFECYCLE:confirmed] ลูกค้ายืนยันงานแล้ว — ห้ามเสนอราคาใหม่/ส่วนลด/เปลี่ยนวัน-สถานที่-จำนวนคน-เมนูเอง ให้ตอบข้อมูลทั่วไปเท่านั้น เรื่องแก้ไขงานให้ประสานทีมงาน
- **ห้ามถามข้อมูลจัดงานซ้ำ** เช่น สถานที่ จำนวนแขก วันงาน ประเภทงาน — ถือว่ายืนยันแล้ว
- ถ้าลูกค้าขอเอกสาร (ใบกำกับภาษี/ใบเสร็จ/เอกสารบัญชี/หัก ณ ที่จ่าย) → ห้ามยืนยันเอง ให้ตอบว่า "ขอประสานงานทีมงานให้ดูแลต่อค่ะ 🙏"`,
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
- ใบกำกับภาษี / ใบเสร็จ / เอกสารบัญชี / หัก ณ ที่จ่าย / เอกสารการเงินทุกชนิด
- เปลี่ยนวันงาน / เปลี่ยนสถานที่ / เปลี่ยนจำนวนคน / เปลี่ยนเมนู / เปลี่ยนแพ็กเกจ (สำหรับงานที่ยืนยันแล้ว)
- ยกเลิกงาน / คืนมัดจำ / คืนเงิน / เคลม / ร้องเรียน / ปัญหาคุณภาพ / เลื่อนงาน / คิวงาน
- อนุมัติเงื่อนไขพิเศษ / ข้อตกลงนอกแพ็กเกจ`;
}

/**
 * Service scope classifier — 5 categories. AI must classify from context/latest message
 * and answer only within that scope. When unclear → ask to clarify scope, DO NOT guess
 * "งานบุญครบชุด" as default.
 */
export function buildServiceScopeBlock(): string {
  return `[SERVICE_SCOPE] แยกประเภทบริการก่อนตอบ — จับจากข้อความล่าสุดของลูกค้า + บริบท:
1. **งานบุญครบชุด** — ทำบุญ/พิธีสงฆ์ + อาหาร + อุปกรณ์ครบ (ตอบได้เต็มแพ็กเกจ)
2. **อาหารอย่างเดียว** — ลูกค้าต้องการเฉพาะอาหาร/เมนู (ตอบเฉพาะเมนู/จำนวนท่าน/วัน/สถานที่จัดส่ง — **ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์**)
3. **เช่าอุปกรณ์ ไม่มีอาหาร** — เช่าโต๊ะ/เก้าอี้/เต็นท์/จาน/ชาม (ตอบเฉพาะอุปกรณ์/จำนวน/วันใช้งาน/พื้นที่จัดส่ง — **ห้ามลากไปตอบเมนูอาหาร/แพ็กเกจงานบุญครบชุด**)
4. **พิธีสงฆ์ / อุปกรณ์พิธีอย่างเดียว** — นิมนต์พระ/สังฆทาน/อุปกรณ์พิธี (ตอบเฉพาะเรื่องพิธี — ห้ามลากไปตอบอาหาร/แพ็กเกจครบชุด)
5. **ยังไม่ชัดเจน** — ถ้าลูกค้ายังไม่ระบุ scope → **ต้องถามแยก scope ก่อน** ห้ามเดาว่าเป็นงานบุญครบชุด

กฎ scope (สำคัญ):
- ตอบภายใน scope ที่ลูกค้าระบุเท่านั้น
- ถ้า scope ยังไม่ชัด ถามแบบ neutral เช่น "ลูกค้าสนใจเป็นแพ็กเกจครบชุด หรือเฉพาะอาหาร/อุปกรณ์อย่างเดียวคะ?"`;
}

/**
 * Defer detection — customer signals they'll follow up later. AI must acknowledge and stop.
 */
export function buildDeferDetectionBlock(): string {
  return `[DEFER_DETECTION] ถ้าข้อความลูกค้าตรงกับสัญญาณเหล่านี้ (หรือใกล้เคียง):
- "เดี๋ยวแจ้งกลับ" / "เดี๋ยวติดต่อกลับ"
- "ขอเช็กก่อน" / "ขอดูก่อน"
- "ขอคิดดูก่อน" / "ขอตัดสินใจก่อน"
- "ยังไม่แน่ใจ" / "ยังไม่ชัวร์"
- "รอก่อน" / "ไว้ก่อน"
- "ขอปรึกษาก่อน" / "ขอถามที่บ้าน/หัวหน้าก่อน"

→ AI ตอบรับทราบสั้น ๆ อย่างสุภาพ เช่น "รับทราบค่ะ รอลูกค้าสะดวกแล้วแจ้งได้เลยนะคะ 🙏"
→ **ห้ามถามข้อมูลต่อ ห้ามตื๊อ ห้ามเสนอโปร/ทางเลือกเพิ่มในจังหวะนี้เด็ดขาด**`;
}

/**
 * Context-grounded / evidence-based reply rules.
 */
export function buildContextGroundedBlock(): string {
  return `[CONTEXT_GROUNDED] ตอบตามบริบทและข้อมูลที่มี ห้ามเดา ห้ามมั่นใจเกินจริง:
1. ยึด "ข้อความล่าสุดของลูกค้า" เป็นหลัก — ตอบเฉพาะประเด็นที่ลูกค้าถามในข้อความล่าสุดก่อน
2. ใช้ customer context / KB เป็นข้อมูลประกอบ — **ห้ามเดาข้อมูลที่ไม่มี**
3. ถ้าข้อมูลไม่พอ → ถามเฉพาะข้อมูลที่ขาดจริง ๆ (ทีละเรื่อง) — ไม่ถามยกชุด
4. ถ้า service scope ยังไม่ชัด → ถามแยก scope ก่อน (ตาม [SERVICE_SCOPE] ข้อ 5)
5. ถ้า service scope ชัดแล้ว → ตอบเฉพาะ scope นั้น ห้ามลากข้าม scope
6. **ห้ามใช้คำมั่นใจเกินจริง** เช่น "จัดการให้ครบแน่นอน" / "รับรอง" / "ยืนยันได้เลย" ถ้า KB/context ไม่ยืนยัน
7. ประเด็นต่อไปนี้ให้ส่งต่อทีมงานเสมอ (ตาม [GUARDRAIL]): ราคานอกแคตตาล็อก, ส่วนลด, คิว, เลื่อนงาน, มัดจำ, คืนเงิน, ใบกำกับภาษี/ใบเสร็จ/เอกสารบัญชี`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2.1 — CURRENT_CUSTOMER_CONTEXT block (pure)
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerContextColumns {
  name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  guest_count?: number | string | null;
  venue?: string | null;
  province?: string | null;
  tax_id?: string | null;
}

// Labels for CURRENT (active) events
const COLUMN_ORDER_CURRENT: Array<[keyof CustomerContextColumns, string]> = [
  ["name", "ชื่อ"],
  ["nickname", "ชื่อเล่น"],
  ["phone", "เบอร์โทร"],
  ["event_type", "ประเภทงาน"],
  ["event_date", "วันจัดงาน"],
  ["guest_count", "จำนวนคน"],
  ["venue", "สถานที่"],
  ["province", "จังหวัด"],
  ["tax_id", "เลขผู้เสียภาษี"],
];

// Labels for PAST events (completed_*) — event-related fields become "ครั้งก่อน"
const COLUMN_ORDER_PAST: Array<[keyof CustomerContextColumns, string]> = [
  ["name", "ชื่อ"],
  ["nickname", "ชื่อเล่น"],
  ["phone", "เบอร์โทร"],
  ["event_type", "ประเภทงานครั้งก่อน"],
  ["event_date", "วันจัดงานครั้งก่อน"],
  ["guest_count", "จำนวนคนครั้งก่อน"],
  ["venue", "สถานที่ครั้งก่อน"],
  ["province", "จังหวัดครั้งก่อน"],
  ["tax_id", "เลขผู้เสียภาษี"],
];

// intent_data key → past-mode Thai label (event-related only)
const PAST_INTENT_LABEL: Record<string, string> = {
  service_type: "รูปแบบอาหาร/บริการครั้งก่อน",
};

const RESERVED_INTENT_KEYS = new Set<string>([
  ...COLUMN_ORDER_CURRENT.map(([k]) => k as string),
  "venue_location", // rendered separately in webhook
  "_pilot_marker",
]);

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s.length > 0;
}

export interface CurrentCustomerContextResult {
  block: string;
  /** Field KEYS only (no values) — safe to log. */
  fieldNames: string[];
}

function isPastLifecycle(lifecycle?: Lifecycle | null): boolean {
  if (!lifecycle) return false;
  return lifecycle === "completed_recent"
    || lifecycle === "completed_warm"
    || lifecycle === "completed_old"
    || lifecycle === "completed_unknown";
}

/**
 * Pure block builder — merges customer columns + intent_data (columns take priority).
 * - Empty/blank values are skipped.
 * - Never mutates inputs.
 * - Returns `{ block: "", fieldNames: [] }` when no data → caller can skip injection.
 * - Complex object values in intent_data (e.g. venue_location) are skipped (rendered elsewhere).
 * - Phase 2.1.1: when `lifecycle` is completed_* → render as [PAST_EVENT_CONTEXT] with
 *   "ครั้งก่อน" labels and past-event rules (event is over, do NOT treat as current).
 */
export function buildCurrentCustomerContextBlock(
  columns: CustomerContextColumns | null | undefined,
  intentData: Record<string, unknown> | null | undefined,
  lifecycle?: Lifecycle | null,
): CurrentCustomerContextResult {
  const cols = columns ?? {};
  const intent = (intentData && typeof intentData === "object") ? intentData : {};
  const past = isPastLifecycle(lifecycle);
  const columnOrder = past ? COLUMN_ORDER_PAST : COLUMN_ORDER_CURRENT;

  const lines: string[] = [];
  const fieldNames: string[] = [];

  // 1. Columns first (primary source)
  for (const [key, label] of columnOrder) {
    const v = (cols as Record<string, unknown>)[key];
    if (isPresent(v)) {
      lines.push(`- ${label}: ${String(v).trim()}`);
      fieldNames.push(key);
    }
  }

  // 2. intent_data fills gaps (only keys columns didn't provide)
  const filledKeys = new Set(fieldNames);
  for (const [key, val] of Object.entries(intent)) {
    if (filledKeys.has(key)) continue;
    if (RESERVED_INTENT_KEYS.has(key)) continue;
    if (!isPresent(val)) continue;
    if (typeof val === "object") continue;
    const label = past ? (PAST_INTENT_LABEL[key] ?? key) : key;
    lines.push(`- ${label}: ${String(val).trim()}`);
    fieldNames.push(key);
  }

  if (lines.length === 0) {
    return { block: "", fieldNames: [] };
  }

  const block = past
    ? `[PAST_EVENT_CONTEXT] งานที่ลูกค้าเคยจัดกับเรา:
หมายเหตุ: งานนี้จบแล้ว ห้ามถือว่าเป็นงานปัจจุบันของลูกค้า
${lines.join("\n")}

กฎการใช้ข้อมูล (สำคัญมาก):
- ใช้ข้อมูลนี้เพื่อเข้าใจประวัติลูกค้าและช่วยให้คุยต่อได้ง่ายขึ้น
- ห้ามถือว่าข้อมูลนี้เป็นรายละเอียดของงานใหม่
- ถ้าลูกค้าพูดถึงงานใหม่ ให้ถือว่าเป็นงานใหม่ และสามารถถามรายละเอียดใหม่ได้ เช่น วันจัดงาน จำนวนคน สถานที่ รูปแบบอาหาร
- อย่าอ้างวัน/จำนวนคน/สถานที่เดิมเป็นค่าเริ่มต้นของงานใหม่ เว้นแต่ลูกค้าพูดชัดว่า "เหมือนเดิม", "แบบเดิม", "สถานที่เดิม", "จำนวนเท่าเดิม"
- ถ้าลูกค้าถามราคาเดิม/เงื่อนไขเดิม/คิวใหม่ ให้ส่งต่อทีมงาน ห้ามยืนยันเอง
- ถ้าลูกค้าถามหลายประเด็นในข้อความเดียว ให้ตอบทีละประเด็น — ห้ามยัดทุกประเด็นในบับเบิลเดียว
- ถ้าประเด็นใดเป็น high-risk (ตาม [GUARDRAIL]) ให้ส่งต่อทีมงานเฉพาะประเด็นนั้น ประเด็นอื่นตอบตามปกติ`
    : `[CURRENT_CUSTOMER_CONTEXT] ข้อมูลลูกค้ารายนี้ (คอลัมน์หลัก + intent_data — คอลัมน์เป็นหลัก):
${lines.join("\n")}

กฎการใช้ context นี้ (สำคัญมาก):
- ห้ามถามซ้ำในข้อมูลที่ปรากฏด้านบนเด็ดขาด (ถือว่ารู้แล้ว)
- ถ้าลูกค้าถามหลายประเด็นในข้อความเดียว ให้ตอบทีละประเด็น — ห้ามยัดทุกประเด็นในบับเบิลเดียว
- ถ้าประเด็นใดเป็น high-risk (ตาม [GUARDRAIL]) ให้ส่งต่อทีมงานเฉพาะประเด็นนั้น ประเด็นอื่นตอบตามปกติ
- ห้ามวนถามเรื่องเดิมซ้ำ — ถ้าถามแล้วลูกค้ายังไม่ตอบ ให้ข้ามไปเรื่องอื่นก่อน
- ถ้า context ขัดกับสิ่งที่ลูกค้าเพิ่งพูด ให้ยึดสิ่งที่ลูกค้าเพิ่งพูด แล้วแจ้งประสานทีมงานปรับข้อมูลให้`;

  return { block, fieldNames };
}

// ─────────────────────────────────────────────────────────────
// Phase 2 gating helper — decide whether Phase 2/2.1/2.1.1 should run for a
// given customer. Pure function; no I/O. Supports two gating modes:
//   1. whitelist  → customer_id ∈ ai_policy_config.test_customer_ids
//   2. live_rollout → ai_policy_config.live_rollout_enabled=true AND
//                     now < live_rollout_until (parsed as ISO date)
// Master flag `advanced_ai_status_policy_enabled` must be true for either to
// take effect. Any parse error / invalid until → live rollout treated OFF.
export type Phase2Mode = "off" | "test_customer_ids" | "live_rollout";

export interface Phase2GateResult {
  enabled: boolean;
  mode: Phase2Mode;
  reason: string;
}

export function resolvePhase2Gate(args: {
  customerId?: string | null;
  settings: AppSettingsLike;
  now?: Date;
}): Phase2GateResult {
  const now = args.now ?? new Date();
  const settings = args.settings ?? {};
  if (settings.advanced_ai_status_policy_enabled !== true) {
    return { enabled: false, mode: "off", reason: "flag_off" };
  }
  const cfg = (settings.ai_policy_config ?? {}) as Record<string, unknown>;

  // 1) test_customer_ids whitelist (kept for backward compatibility)
  const rawIds = (cfg as any).test_customer_ids;
  const testIds: string[] = Array.isArray(rawIds)
    ? rawIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (args.customerId && testIds.includes(args.customerId)) {
    return { enabled: true, mode: "test_customer_ids", reason: "customer_in_whitelist" };
  }

  // 2) temporary live rollout — requires enabled=true AND valid future until
  const liveEnabled = (cfg as any).live_rollout_enabled === true;
  if (!liveEnabled) {
    return { enabled: false, mode: "off", reason: "no_whitelist_no_live" };
  }
  const untilRaw = (cfg as any).live_rollout_until;
  if (typeof untilRaw !== "string" || untilRaw.length === 0) {
    return { enabled: false, mode: "off", reason: "live_rollout_until_missing" };
  }
  const untilMs = Date.parse(untilRaw);
  if (!Number.isFinite(untilMs)) {
    return { enabled: false, mode: "off", reason: "live_rollout_until_invalid" };
  }
  if (now.getTime() >= untilMs) {
    return { enabled: false, mode: "off", reason: "live_rollout_expired" };
  }
  return { enabled: true, mode: "live_rollout", reason: "live_rollout_active" };
}
