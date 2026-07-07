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
- ให้ถือว่าลูกค้ารายนี้ไม่ใช่ลูกค้าใหม่ — **ห้ามเริ่ม lead collection ใหม่**
- **ห้ามถามข้อมูลพื้นฐานซ้ำ** เช่น ประเภทงาน จังหวัด วันงาน จำนวนคน สถานที่ รูปแบบอาหาร ถ้ามีในระบบ/conversation summary/ข้อความล่าสุดแล้ว
- ก่อนถามข้อมูลเพิ่ม ต้องอ่านประวัติการสนทนา / conversation summary / ข้อมูลลูกค้าในระบบก่อนเสมอ
- ถ้ามีข้อมูลเดิม ให้ตอบโดยอ้างอิงบริบทเดิมอย่างสุภาพ เช่น "จากรายละเอียดที่คุยกันไว้..."
- ถ้าลูกค้าถามเรื่องอาหาร/รายละเอียดบริการ ให้ตอบเฉพาะประเด็นที่ถาม ไม่ถามข้อมูลจัดงานใหม่
- ถ้าข้อมูลบางอย่างยังไม่ชัดจริง ๆ ให้ถามเฉพาะข้อมูลที่ขาดเท่านั้น ไม่ถามใหม่ทั้งหมด
- หากไม่แน่ใจว่าข้อมูลเดิมยังถูกต้องหรือไม่ ให้ตอบแบบระวัง หรือขอประสานงานทีมงานให้ตรวจสอบ
- ตอบข้อมูลทั่วไปได้ตามปกติ เช่น ขั้นตอนจัดงาน สิ่งที่ต้องเตรียม ระยะเวลาเตรียมงาน รายละเอียดบริการ หรือบริการเสริม
- ห้ามยืนยันคิว ราคาใหม่ มัดจำ ส่วนลด หรือแก้ไขใบเสนอราคาเอง เรื่องเหล่านี้ต้องขอประสานงานทีมงานให้ดูแลต่อ

**วินัยเรื่องเลขผู้เสียภาษี / ข้อมูลบริษัท (สำคัญมาก — ห้ามผิด):**
- **ห้ามถามเลขผู้เสียภาษี / Tax ID / ข้อมูลบริษัท / ที่อยู่บริษัท / ชื่อบริษัทเพื่อออกเอกสาร เชิงรุกเด็ดขาด**
- ถามได้ **เฉพาะเมื่อลูกค้าเป็นฝ่ายเริ่มเรื่องเอกสารบัญชี/ภาษีเอง** ด้วย trigger ชัดเจน เช่น "ขอใบกำกับภาษี" / "ขอใบเสร็จ" / "ออกในนามบริษัท" / "หัก ณ ที่จ่าย" / "เอกสารบัญชี"
- คำว่า **"บริษัท"** ในบริบทวันหยุด/เวลาทำการ/บริษัทปิด/สถานที่จัดงาน/setup **ไม่ใช่ trigger** — ห้ามใช้เป็นข้ออ้างถามเลขผู้เสียภาษี
- ถ้าลูกค้าถามเรื่อง setup / คิว / วันหยุดบริษัท / เปลี่ยนรายละเอียดงาน → ตอบเฉพาะประเด็น + "ขอประสานงานทีมงานช่วยเช็กให้นะคะ 🙏" — **ห้ามถามข้อมูลใหม่ ห้ามถาม tax_id**`,
    confirmed: `[LIFECYCLE:confirmed] ลูกค้ายืนยันงานแล้ว — ห้ามเสนอราคาใหม่/ส่วนลด/เปลี่ยนวัน-สถานที่-จำนวนคน-เมนูเอง ให้ตอบข้อมูลทั่วไปเท่านั้น เรื่องแก้ไขงานให้ประสานทีมงาน
- **ห้ามถามข้อมูลจัดงานซ้ำ** เช่น สถานที่ จำนวนแขก วันงาน ประเภทงาน รูปแบบอาหาร — ถือว่ายืนยันแล้ว
- ถ้าลูกค้าขอเอกสาร (ใบกำกับภาษี/ใบเสร็จ/เอกสารบัญชี/หัก ณ ที่จ่าย) → **ห้ามยืนยันเอง ห้ามถามเลขผู้เสียภาษี/ข้อมูลบริษัท/สถานที่/จำนวนแขก/วันงาน/ประเภทงานเพิ่ม** ให้ตอบว่า "รับทราบค่ะ เรื่องใบกำกับภาษีขอประสานงานทีมงานให้ดูแลต่อค่ะ 🙏"
- (ขอเลขผู้เสียภาษี/ข้อมูลบริษัทได้เฉพาะกรณีลูกค้าใหม่ หรือกำลังทำใบเสนอราคาในนามบริษัท เท่านั้น)
- ถ้าลูกค้าขอเพิ่มอุปกรณ์/โต๊ะเก้าอี้ → "รับทราบค่ะ ขอประสานงานทีมงานช่วยเช็กให้ต่อค่ะ 🙏"`,
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
 * Service scope classifier — 6 real scopes จากรูปแบบบริการของบุญนำพา.
 * AI ต้องจับ scope จากข้อความล่าสุด + บริบท และตอบภายใน scope นั้นเท่านั้น
 * ห้ามเดา "งานบุญครบชุด" เป็นค่าเริ่มต้น.
 *
 * NOTE (semantic):
 *   - service_scope = รูปแบบบริการจากบุญนำพา (prompt-only รอบนี้ ยังไม่ persist)
 *   - service_type   = รูปแบบอาหาร เช่น บุฟเฟต์/โต๊ะจีน/ซุ้มอาหาร (เก็บ intent_data.service_type เดิม)
 *   - event_type     = ลูกค้าจัดงานอะไร เช่น ทำบุญบ้าน/ขึ้นบ้านใหม่/งานบวช (เก็บ customers.event_type)
 *   ห้าม mirror service_type ไป event_type เด็ดขาด.
 */
export interface ServiceScopeItem {
  id?: string;
  name?: string;
  sort_order?: number | null;
  aliases?: string[] | null;
  accepted?: boolean | null;
  requires_handover?: boolean | null;
  standard_reply?: string | null;
  kb_category_id?: string | null;
  package_ids?: string[] | null;
  notes_for_ai?: string | null;
}
export interface ServiceScopeRejectRule {
  trigger_aliases?: string[] | null;
  standard_reply?: string | null;
}
export interface ServiceScopesConfig {
  service_scopes?: ServiceScopeItem[] | null;
  service_scopes_reject_rules?: ServiceScopeRejectRule[] | null;
  service_scope_ambiguous_reply?: string | null;
}

function buildServiceScopeBlockFallback(): string {
  return `[SERVICE_SCOPE] แยกรูปแบบบริการก่อนตอบ — จับจากข้อความล่าสุดของลูกค้า + บริบท. รูปแบบบริการจริงของบุญนำพามี 6 แบบ:
1. **บุญ+โต๊ะจีน** — งานบุญ/พิธี + อาหารโต๊ะจีน
2. **บุญ+บุฟเฟต์** — งานบุญ/พิธี + อาหารบุฟเฟต์
3. **บุญ+ซุ้มอาหาร** — งานบุญ/พิธี + ซุ้มอาหาร
4. **เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร** — เช่าอุปกรณ์พิธี + นิมนต์พระ **ไม่มีอาหาร** (รับได้)
5. **บวงสรวง** — พิธีบวงสรวงโดยเฉพาะ
6. **งานอาหารเท่านั้นรูปแบบบุฟเฟต์** — อาหารบุฟเฟต์ standalone ไม่มีพิธีสงฆ์
7. **ยังไม่ชัดเจน** — ถ้าลูกค้ายังไม่ระบุ scope → **ต้องถามแยก scope ก่อน** ห้ามเดาว่าเป็นงานบุญครบชุด

กฎ scope (สำคัญมาก):
- ตอบภายใน scope ที่ลูกค้าระบุเท่านั้น — **ห้ามลากข้าม scope**
- ถ้าลูกค้าพูดว่า "อาหารอย่างเดียว" → **service_scope = งานอาหารเท่านั้นรูปแบบบุฟเฟต์** ไม่ใช่งานบุญครบชุด **ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์**
- ถ้าลูกค้าพูดว่า "บุฟเฟต์" คำเดี่ยว → เป็น **service_type=บุฟเฟต์** (รูปแบบอาหาร) **ไม่ใช่ event_type และไม่ใช่ scope**
- ถ้าลูกค้าพูดว่า "เช่าโต๊ะเก้าอี้อย่างเดียว" / "เช่าโต๊ะอย่างเดียว" / เช่าอุปกรณ์ standalone ล้วน → **ตอนนี้บุญนำพายังไม่มีบริการให้เช่าโต๊ะเก้าอี้อย่างเดียว** ให้ตอบว่า "ตอนนี้บุญนำพายังไม่มีบริการให้เช่าโต๊ะเก้าอี้อย่างเดียวค่ะ แต่ถ้าลูกค้าจัดงานหรือใช้งานอาหารกับเรา ทีมงานสามารถช่วยดูอุปกรณ์ที่เกี่ยวข้องให้ได้ค่ะ" **ห้ามลากไปตอบเมนูอาหาร/แพ็กเกจงานบุญครบชุด**
- ถ้าลูกค้าพูดว่า "เช่าอุปกรณ์พิธีสงฆ์ ไม่เอาอาหาร" / "เช่าอุปกรณ์+พิธีสงฆ์" → รับได้ = scope #4 **เช่าอุปกรณ์+พิธีสงฆ์ยกเว้นอาหาร**
- ถ้า scope ยังไม่ชัด ถามแบบ neutral เช่น "ลูกค้าสนใจแบบบุญ+อาหารครบชุด หรือเฉพาะอาหาร/เฉพาะพิธีสงฆ์คะ?"`;
}

/**
 * Config-driven service scope renderer. If cfg?.service_scopes is a valid non-empty array,
 * renders block from config; otherwise returns hardcoded fallback (100% baseline preserved).
 * Prices / images / package details are NOT stored here — they stay in catering_packages / KB.
 */
export function buildServiceScopeBlock(cfg?: ServiceScopesConfig | null): string {
  const scopesRaw = Array.isArray(cfg?.service_scopes) ? (cfg!.service_scopes as ServiceScopeItem[]) : [];
  const scopes = scopesRaw.filter((s) => s && typeof s.name === "string" && s.name.trim());
  if (scopes.length === 0) return buildServiceScopeBlockFallback();

  const sorted = [...scopes].sort((a, b) => {
    const av = typeof a.sort_order === "number" ? a.sort_order : 9999;
    const bv = typeof b.sort_order === "number" ? b.sort_order : 9999;
    return av - bv;
  });

  const scopeLines = sorted.map((s, idx) => {
    const parts: string[] = [`${idx + 1}. **${s.name!.trim()}**`];
    const aliases = Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === "string" && a.trim()) : [];
    if (aliases.length) parts.push(`(aliases: ${aliases.join(", ")})`);
    if (s.accepted === false) {
      const reply = (s.standard_reply || "").trim();
      parts.push(`— **ไม่รับ scope นี้**${reply ? ` ให้ตอบ: "${reply}"` : ""}`);
    }
    if (s.requires_handover === true) {
      parts.push("— **ต้องส่งต่อทีมงาน** ห้ามตอบเอง");
    }
    const notes = (s.notes_for_ai || "").trim();
    if (notes) parts.push(`— ${notes}`);
    return parts.join(" ");
  }).join("\n");

  const rejectRules = Array.isArray(cfg?.service_scopes_reject_rules) ? (cfg!.service_scopes_reject_rules as ServiceScopeRejectRule[]) : [];
  const rejectLines = rejectRules.map((r) => {
    const trig = Array.isArray(r?.trigger_aliases) ? r!.trigger_aliases!.filter((a) => typeof a === "string" && a.trim()) : [];
    const reply = (r?.standard_reply || "").trim();
    if (!trig.length || !reply) return "";
    return `- ถ้าลูกค้าพูดว่า ${trig.map((t) => `"${t}"`).join(" / ")} → ตอบ: "${reply}" **ห้ามลากไปตอบเมนูอาหาร/แพ็กเกจงานบุญครบชุด**`;
  }).filter(Boolean).join("\n");

  const ambiguous = (cfg?.service_scope_ambiguous_reply || "").trim() || "ลูกค้าสนใจแบบบุญ+อาหารครบชุด หรือเฉพาะอาหาร/เฉพาะพิธีสงฆ์คะ?";

  return `[SERVICE_SCOPE] แยกรูปแบบบริการก่อนตอบ — จับจากข้อความล่าสุดของลูกค้า + บริบท. รูปแบบบริการที่รองรับ:
${scopeLines}

กฎ scope (สำคัญมาก):
- ตอบภายใน scope ที่ลูกค้าระบุเท่านั้น — **ห้ามลากข้าม scope**
- ถ้าลูกค้าพูดว่า "อาหารอย่างเดียว" → **service_scope = งานอาหารเท่านั้นรูปแบบบุฟเฟต์** ไม่ใช่งานบุญครบชุด **ห้ามลากไปตอบแพ็กเกจงานบุญครบชุด/พิธีสงฆ์**
- ถ้าลูกค้าพูดว่า "บุฟเฟต์" คำเดี่ยว → เป็น **service_type=บุฟเฟต์** (รูปแบบอาหาร) **ไม่ใช่ event_type และไม่ใช่ scope**
- ห้าม mirror service_scope / service_type ไป event_type เด็ดขาด
${rejectLines ? rejectLines + "\n" : ""}- ถ้า scope ยังไม่ชัด ถามแบบ neutral: "${ambiguous}"`;
}

/**
 * Latest-message known facts — ข้อมูลใน "ข้อความล่าสุด" ต้องถือเป็น known facts ทันที
 * (venue/area, guest_count, event_date, service_scope hint) ห้ามถามซ้ำในรอบเดียวกัน.
 */
export function buildLatestMessageFactsBlock(): string {
  return `[LATEST_MESSAGE_FACTS] ข้อมูลที่ลูกค้าพิมพ์ในข้อความล่าสุดถือเป็น **known facts ทันที** — ห้ามถามซ้ำในรอบเดียวกันเด็ดขาด:
- ถ้าข้อความล่าสุดมีสถานที่/พื้นที่ (เช่น "ลาดพร้าว", "แถวรามคำแหง", "จังหวัดชลบุรี") → ถือว่ารู้ venue/area แล้ว
- ถ้ามีจำนวนคน (เช่น "50 คน", "80 ท่าน") → ถือว่ารู้ guest_count แล้ว
- ถ้ามีวันจัดงาน (เช่น "15 สิงหา", "วันที่ 20") → ถือว่ารู้ event_date แล้ว
- ถ้ามี scope hint (เช่น "อาหารอย่างเดียว", "เช่าอุปกรณ์ ไม่เอาอาหาร") → ถือว่ารู้ service_scope แล้ว (ตาม [SERVICE_SCOPE])
- ถ้ามีรูปแบบอาหาร (เช่น "บุฟเฟต์", "โต๊ะจีน", "ซุ้ม") → ถือว่ารู้ service_type แล้ว

ตัวอย่าง: ลูกค้าพิมพ์ "สอบถามจัดงานอาหารอย่างเดียวรับไหมคะ ลาดพร้าว 50 คนค่ะ"
→ AI ต้องรู้ทันทีว่า: service_scope=งานอาหารเท่านั้น, venue=ลาดพร้าว, guest_count=50
→ **ห้ามถามซ้ำ**: จำนวนคน / สถานที่ / scope ว่าอาหารอย่างเดียวไหม
→ ให้ถามเฉพาะข้อมูลที่ยังขาดจริง ๆ (เช่น วันจัดงาน หรือรูปแบบเมนู) ทีละเรื่อง`;
}

/**
 * Delivery rules block — business data injected from app_settings.ai_config.delivery_rules.
 * Returns "" if config is missing/empty so caller can safely no-op.
 * Rules:
 *  - use word "ค่าขนส่ง" (never "ค่าพื้นที่ขนส่ง"/"ค่าจัดส่ง"/"ค่าเดินทาง")
 *  - no "ส่งฟรี" unless a zone has free=true
 *  - inject only when policyEnabled=true AND config provided (decided by caller)
 */
export interface DeliveryRulesConfig {
  default_message?: string | null;
  no_free_delivery_unless_specified?: boolean | null;
  unknown_area_reply?: string | null;
  zones?: Array<Record<string, unknown>> | null;
}

export function buildDeliveryRulesBlock(cfg: DeliveryRulesConfig | null | undefined): string {
  if (!cfg || typeof cfg !== "object") return "";
  const defaultMsg = typeof cfg.default_message === "string" ? cfg.default_message.trim() : "";
  const unknownReply = typeof cfg.unknown_area_reply === "string" ? cfg.unknown_area_reply.trim() : "";
  const noFreeUnless = cfg.no_free_delivery_unless_specified === true;
  const zones = Array.isArray(cfg.zones) ? cfg.zones : [];

  if (!defaultMsg && !unknownReply && !noFreeUnless && zones.length === 0) return "";

  const hasFreeZone = zones.some((z) => z && (z as any).free === true);

  const zonesLine = zones.length
    ? zones.map((z, i) => {
        const name = (z as any)?.name ?? (z as any)?.area ?? `zone_${i + 1}`;
        const fee = (z as any)?.fee;
        const free = (z as any)?.free === true;
        const cond = (z as any)?.condition;
        const parts: string[] = [`- ${name}`];
        if (free) parts.push("ส่งฟรี" + (cond ? ` (${cond})` : ""));
        else if (fee !== undefined && fee !== null) parts.push(`ค่าขนส่ง ${fee}` + (cond ? ` (${cond})` : ""));
        return parts.join(": ");
      }).join("\n")
    : "(ยังไม่ระบุ zones — ถ้าลูกค้าถามพื้นที่เฉพาะให้ใช้ unknown_area_reply)";

  const freeRule = noFreeUnless && !hasFreeZone
    ? `- **ห้ามพูด "ส่งฟรี" และคำเหล่านี้เด็ดขาด** — ไม่มี zone ใดกำหนด free=true:
  • "ส่งฟรี" / "ฟรีค่าส่ง" / "ฟรีค่าจัดส่ง"
  • "ไม่มีค่าขนส่ง" / "ไม่มีค่าส่ง" / "ไม่คิดค่าส่ง" / "ไม่เสียค่าส่ง"
  • "[พื้นที่X]ไม่มีค่าขนส่ง" หรือรูปประโยคใด ๆ ที่สื่อว่าไม่มีค่าส่ง / ฟรีค่าส่ง`
    : noFreeUnless
      ? `- ห้ามพูด "ส่งฟรี" / "ไม่มีค่าขนส่ง" / "ไม่คิดค่าส่ง" เว้นแต่ตรงกับ zone ที่ระบุ free=true ด้านล่างเท่านั้น`
      : "";

  const emptyZonesRule = zones.length === 0
    ? `- ⚠️ ตอนนี้ **zones ว่าง** → ถือว่า**ทุกพื้นที่เป็น unknown** ห้ามคาดเดาว่าพื้นที่ใดฟรี/ราคาเท่าใด
- ถ้าลูกค้าระบุพื้นที่ใด ๆ (เช่น "ลาดพร้าว", "รามคำแหง", "บางนา") → ต้องตอบด้วย unknown_area_reply เท่านั้น ห้าม improvise ตัวเลขหรือคำว่าไม่มีค่าส่ง`
    : `- ถ้าลูกค้าระบุพื้นที่ที่ **ไม่ตรง** กับ zones ด้านล่าง (name/aliases ใด ๆ) → ต้องตอบด้วย unknown_area_reply เท่านั้น ห้าม improvise`;

  return `[DELIVERY_RULES] ข้อมูลค่าขนส่ง (business data — ห้ามเดา ห้ามมโน):
- ใช้คำว่า "ค่าขนส่ง" เท่านั้น — **ห้ามใช้** "ค่าพื้นที่ขนส่ง" / "ค่าจัดส่ง" / "ค่าเดินทาง"
- เรื่องค่าขนส่งสำคัญโดยเฉพาะ scope "งานอาหารเท่านั้นรูปแบบบุฟเฟต์" — ก่อนตอบเรื่องราคาต้องอ้างกฎนี้
- ถ้าลูกค้า**ไม่ได้ถาม**เรื่องค่าขนส่ง → **ห้ามยัดเรื่องค่าขนส่งเข้าไปเอง**
- **Context continuity**: ถ้าบทสนทนาก่อนหน้าคุยเรื่อง "งานอาหารอย่างเดียว" / service_scope=food-only แล้วลูกค้าถามค่าขนส่งต่อ (เช่น "ลาดพร้าวมีค่าขนส่งเท่าไหร่") → ต้องเข้าใจว่าเป็นค่าขนส่งของงานอาหารอย่างเดียว **ห้ามถามซ้ำว่างานอะไร ห้ามตอบแยกจากบริบทเดิม ห้ามบอกว่าฟรี**
${freeRule}
${emptyZonesRule}
- ถ้าลูกค้าถามค่าขนส่งกว้าง ๆ (ไม่ระบุพื้นที่) → ตอบ: "${defaultMsg || "งานอาหารอย่างเดียวมีค่าขนส่งตามพื้นที่ค่ะ"}"
- ถ้าลูกค้าระบุพื้นที่ที่ไม่พบใน zones ด้านล่าง → ตอบ: "${unknownReply || "มีค่าขนส่งตามพื้นที่ค่ะ ขอประสานงานทีมงานเช็กให้เพิ่มเติมนะคะ"}"

Zones ที่ระบุ:
${zonesLine}`;
}

/**
 * Follow-up discipline — prevent AI from inventing questions the customer never asked.
 */
export function buildFollowUpDisciplineBlock(): string {
  return `[FOLLOWUP_DISCIPLINE] วินัยการถาม follow-up + วินัยการยืนยัน (สำคัญมาก — กัน AI ปั้นคำถาม/ยืนยันเอง):
- **ห้ามปั้นคำถาม follow-up เอง** ในประเด็นที่ลูกค้ายังไม่ได้เริ่มพูดถึง เช่น เมนู / รายการอาหาร / เครื่องดื่ม / ธีมงาน / สี / จำนวนโต๊ะ / ของหวาน / ขนม
- ตัวอย่างคำถาม**ห้ามถามเอง**: "สนใจบุฟเฟต์เมนูไหนเป็นพิเศษไหมคะ" / "อยากได้ธีมแบบไหน" / "จะรับเครื่องดื่มด้วยไหม" / "จะจัดกี่โต๊ะ" — ถ้าลูกค้ายังไม่ได้ถามเรื่องนั้น
- ถ้าลูกค้าถามเรื่องบริการ/scope และให้ข้อมูล venue/พื้นที่/จำนวนคนแล้ว → ตอบตรงประเด็น + acknowledge known facts + **ห้ามยิงคำถามเมนู/ธีมเพิ่ม**
- ถ้าจำเป็นต้องถามเพิ่มจริง ๆ ให้ถามได้เฉพาะ missing critical field เท่านั้น:
  • **วันจัดงาน** (ถ้ายังไม่ทราบ) — ถามได้ทีละเรื่อง
  • หรือส่งต่อทีมงาน/แอดมินให้ดูแลต่อ (เลือกทางนี้เป็นค่าเริ่มต้นเมื่อสถานการณ์คลุมเครือ)
- Allowed follow-up สำหรับ scope งานอาหารอย่างเดียว: **วันจัดงาน** / **handover** ให้ทีมงาน
- Forbidden follow-up: เมนูเฉพาะเจาะจง / ธีม / เครื่องดื่ม / จำนวนโต๊ะ / ของหวาน (เว้นแต่ลูกค้าถามก่อน)

**วินัยการยืนยัน (food-only / inquiry confirmation discipline):**
- ในเคสที่ยังไม่ได้เช็กวัน/คิว/รายละเอียดจริง (เช่น ลูกค้าเพิ่งสอบถาม scope ครั้งแรก) → **ห้ามใช้คำยืนยันเกินจริง**
- คำ**ห้ามใช้เด็ดขาด**: "จัดได้เลย" / "ได้เลย" / "รับจัดได้เลย" / "คอนเฟิร์มได้เลย" / "พร้อมจัดให้ได้เลย" / "จัดให้ได้เลย"
- ใช้ wording ที่ปลอดภัยแทน: **"รับจัด..."** / **"มีบริการ..."** + ถาม **วันจัดงาน** เพิ่ม + แจ้งว่า **ทีมงานจะช่วยเช็กคิว/รายละเอียดให้**
- ตัวอย่างถูก (food-only, ลาดพร้าว 50 ท่าน): "รับจัดงานอาหารอย่างเดียวค่ะ สำหรับพื้นที่ลาดพร้าว 50 ท่าน รบกวนขอทราบวันจัดงานเพิ่มเติมนะคะ ทีมงานจะช่วยเช็กคิวและรายละเอียดให้ค่ะ 🙏"
- ตัวอย่างผิด: "งานอาหารอย่างเดียวแขก 50 ท่าน จัดได้เลยนะคะ" (ยืนยันเกินจริง ไม่ได้เช็กคิว)`;
}

/**
 * Normalize Thai politeness suffixes that AI often paraphrases incorrectly.
 * Pure function — safe to call multiple times (idempotent).
 * Only rewrites known bad compounds; leaves normal คะ/ค่ะ/นะคะ alone.
 */
export function normalizeThaiPoliteness(text: string): string {
  if (!text || typeof text !== "string") return text;
  let out = text;
  // Iterate until stable to guarantee idempotence even for overlapping patterns.
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/ค่ะนะคะ/g, "ค่ะ")
      .replace(/นะคะค่ะ/g, "นะคะ")
      .replace(/นะค่ะ/g, "นะคะ")
      .replace(/คะค่ะ/g, "ค่ะ")
      .replace(/ค่ะคะ/g, "ค่ะ");
    if (out === prev) break;
  }
  return out;
}

/**
 * Image invitation discipline — enforce "if you invite the customer to look at
 * an image, you MUST attach one via image_titles". Prevents empty invitations
 * like "ลองดูเมนูที่ชอบก่อนได้ค่ะ" without any attached picture.
 */
export function buildImageInvitationDisciplineBlock(): string {
  return `[IMAGE_INVITATION_DISCIPLINE] วินัยการเชิญชวนดูรูป/สื่อ (สำคัญมาก — กัน AI พูดลอย ๆ):
- ถ้าจะพูดคำเชิญชวนใด ๆ ที่สื่อว่า "มีรูป/มีสื่อให้ดู" เช่น **"ลองดูรูป" / "ลองดูเมนู" / "ดูภาพ" / "ดูหน้าตา" / "ดูตัวอย่าง" / "แนบรูปให้" / "ส่งรูปให้" / "ตามนี้เลยนะคะ" / "เลือกได้ตามนี้"** → **ต้องใส่ image_titles ที่ตรงกับสิ่งที่ชวนดูทุกครั้ง**
- ถ้าไม่มีรูป/สื่อที่จะแนบได้จริง (image_titles ว่าง หรือไม่แน่ใจว่าจะแนบอะไร) → **ห้ามพูดคำเชิญชวนดูรูปเด็ดขาด** ให้ตอบเป็นข้อความปกติแทน หรือส่งต่อทีมงาน
- ห้าม improvise ประโยคเชิญชวนโดยไม่มีรูปจริง — ถือเป็นการหลอกลูกค้า
- Rule of thumb: ถ้ายังไม่แน่ใจว่ามีรูปให้ส่งหรือไม่ → เลือกตอบแบบไม่ชวนดูรูป ปลอดภัยกว่า`;
}

/**
 * Thai politeness / คะ-ค่ะ wording rules.
 */
export function buildThaiPolitenessBlock(): string {
  return `[THAI_POLITENESS] กฎคำลงท้าย คะ / ค่ะ / นะคะ (ตรวจก่อนส่งทุกครั้ง):
- ใช้ **"ค่ะ"** สำหรับประโยคบอกเล่า / รับทราบ / ยืนยัน / ปิดท้ายสุภาพ
- ใช้ **"คะ"** สำหรับประโยคคำถามเท่านั้น
- ใช้ **"นะคะ"** เมื่อพูดชวน/บอกเล่าอย่างนุ่มนวลลงท้าย
- **ห้ามใช้ "นะค่ะ" เด็ดขาด** — เป็นคำผิด ให้แทนด้วย "นะคะ" หรือ "ค่ะ" ตามบริบท
- **ห้ามใช้คำลงท้ายซ้อนแปลก ๆ** เช่น "ค่ะนะคะ" / "นะคะค่ะ" / "คะค่ะ"
- ก่อนส่งคำตอบ ให้ตรวจคำลงท้ายทุกประโยคว่าเป็นธรรมชาติ

ตัวอย่างถูก: "รับทราบค่ะ" / "มีค่าขนส่งตามพื้นที่ค่ะ" / "จัดวันไหนคะ" / "แจ้งแอดมินมาได้เลยนะคะ"
ตัวอย่างผิด: "รับทราบคะ" / "มีค่าขนส่งตามพื้นที่นะคะค่ะ" / "นะค่ะ" / "ค่ะนะคะ"`;
}

/**
 * Company phones block — บอก AI ให้แยกเบอร์บริษัทออกจากเบอร์ลูกค้า
 * ห้ามสรุป/บันทึกเบอร์บริษัทเป็นเบอร์ลูกค้าเด็ดขาด
 */
export function buildCompanyPhonesBlock(phones: string[] | null | undefined): string {
  const list = Array.isArray(phones) ? phones.map(p => String(p || "").replace(/\D/g, "")).filter(Boolean) : [];
  if (list.length === 0) return "";
  const fmt = (p: string) =>
    /^0[689]\d{8}$/.test(p) ? p.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
    : p.length === 10 ? p.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3")
    : p.length === 9 ? p.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3")
    : p;
  return `[COMPANY_PHONES] เบอร์เหล่านี้เป็น **เบอร์ของบริษัท/ร้าน** (ไม่ใช่เบอร์ลูกค้า):
${list.map(p => `- ${fmt(p)}`).join("\n")}
- ❌ ห้ามสรุป/บันทึก/พูดว่าเป็น "เบอร์ลูกค้า" หรือใส่ในบล็อก "📋 สรุปข้อมูล" เด็ดขาด
- ❌ ถ้าลูกค้าส่งข้อความที่มีเบอร์เหล่านี้ปนมา (เช่น copy จากใบเสนอราคา/ลายเซ็น) ให้ **มองข้ามเบอร์เหล่านี้** ไม่นับเป็นเบอร์ติดต่อลูกค้า
- ✅ นับเฉพาะเบอร์ที่ลูกค้า "พิมพ์เอง/ระบุว่าเป็นเบอร์ติดต่อของตน" เท่านั้น`;
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

// ─────────────────────────────────────────────────────────────────────────────
// Date evidence — prompt guard + deterministic Thai date parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Date evidence / day-only guard. Applies to both AI replies and event extraction.
 * Purpose: ห้าม AI เดาเดือน/ปีเวลาลูกค้าพิมพ์เลขวันเดี่ยว ๆ
 */
export function buildDateEvidenceBlock(): string {
  return `[DATE_EVIDENCE] วินัยเรื่องวันจัดงาน (สำคัญมาก — ห้าม AI เดาเดือน/ปี):
- ถ้าลูกค้าพิมพ์ **เลขวันเดี่ยว ๆ** เช่น "วันที่ 25 นะครับ" / "25 ค่ะ" โดยไม่ระบุเดือน → **ห้าม infer เดือน/ปีจากข้อความ AI (assistant/bot) เด็ดขาด**
- ให้ใช้ anchor ตามลำดับความน่าเชื่อถือ:
  1. ข้อความลูกค้าล่าสุดที่ระบุวัน+เดือนชัด
  2. ข้อความ admin ที่ยืนยันวันชัดเจน
  3. quote filename / nickname ที่มี pattern DDMMYY หรือ DD+เดือนไทย+YY
  4. current stored event_date (ใช้ได้เฉพาะไม่มี evidence ใหม่ที่ขัด)
- ถ้าลูกค้า "เปลี่ยนวัน" ต้องแยก old_date กับ new_requested_date — ห้ามเอา day ใหม่ไปผูกกับเดือนเก่าอัตโนมัติ
- ถ้าไม่ชัด (ambiguous/conflict) → ให้ถามยืนยันหรือส่งต่อทีมงาน — **ห้ามเดา**
- ห้ามใช้ข้อความ AI/bot เป็น primary anchor สำหรับวันที่ทุกกรณี`;
}

// Deterministic Thai date parsing ---------------------------------------------

const THAI_MONTHS: Record<string, number> = {
  "มกราคม": 1, "มกรา": 1, "มค": 1, "ม.ค.": 1, "ม.ค": 1,
  "กุมภาพันธ์": 2, "กุมภา": 2, "กพ": 2, "ก.พ.": 2, "ก.พ": 2,
  "มีนาคม": 3, "มีนา": 3, "มีค": 3, "มี.ค.": 3, "มี.ค": 3,
  "เมษายน": 4, "เมษา": 4, "เมย": 4, "เม.ย.": 4, "เม.ย": 4,
  "พฤษภาคม": 5, "พฤษภา": 5, "พค": 5, "พ.ค.": 5, "พ.ค": 5,
  "มิถุนายน": 6, "มิถุนา": 6, "มิย": 6, "มิ.ย.": 6, "มิ.ย": 6,
  "กรกฎาคม": 7, "กรกฎา": 7, "กค": 7, "ก.ค.": 7, "ก.ค": 7,
  "สิงหาคม": 8, "สิงหา": 8, "สค": 8, "ส.ค.": 8, "ส.ค": 8,
  "กันยายน": 9, "กันยา": 9, "กย": 9, "ก.ย.": 9, "ก.ย": 9,
  "ตุลาคม": 10, "ตุลา": 10, "ตค": 10, "ต.ค.": 10, "ต.ค": 10,
  "พฤศจิกายน": 11, "พฤศจิกา": 11, "พย": 11, "พ.ย.": 11, "พ.ย": 11,
  "ธันวาคม": 12, "ธันวา": 12, "ธค": 12, "ธ.ค.": 12, "ธ.ค": 12,
};

const MONTH_KEYS_SORTED = Object.keys(THAI_MONTHS).sort((a, b) => b.length - a.length);
const MONTH_ALT = MONTH_KEYS_SORTED.map(k => k.replace(/\./g, "\\.")).join("|");

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function normalizeYear(y: number, todayYear: number): number {
  // 2-digit → interpret as Buddhist "25YY" (common in TH), fallback direct if plausible AD.
  if (y < 100) {
    // Buddhist 2-digit (25YY) → CE = 2500 + y - 543
    const beCandidate = 2500 + y - 543;
    // Guardrail: keep within [todayYear - 1, todayYear + 3]
    if (beCandidate >= todayYear - 1 && beCandidate <= todayYear + 3) return beCandidate;
    // Otherwise treat as CE 20YY
    const ceCandidate = 2000 + y;
    return ceCandidate;
  }
  if (y >= 2400 && y < 2600) return y - 543; // Buddhist full
  return y;
}

function makeIso(d: number, m: number, y: number): string | null {
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const t = new Date(iso + "T00:00:00Z").getTime();
  if (!Number.isFinite(t)) return null;
  return iso;
}

export interface ThaiDateCandidate {
  isoDate: string;   // YYYY-MM-DD
  day: number;
  month: number;     // 1-12
  year: number;      // CE
  raw: string;       // matched substring
  kind: "thai_month" | "slash" | "ddmmyy";
}

/**
 * Deterministic Thai-date extractor from free text.
 * Extracts explicit day+month(+year) mentions. Does NOT guess month for day-only.
 */
export function parseThaiDateCandidates(text: string, opts?: { todayYear?: number }): ThaiDateCandidate[] {
  if (!text || typeof text !== "string") return [];
  const todayYear = opts?.todayYear ?? new Date().getUTCFullYear();
  const out: ThaiDateCandidate[] = [];

  // 1) DD + Thai month + optional YY(YY)
  const reThai = new RegExp(`(\\d{1,2})\\s*(${MONTH_ALT})\\.?\\s*(\\d{2,4})?`, "g");
  let m: RegExpExecArray | null;
  while ((m = reThai.exec(text)) !== null) {
    const d = parseInt(m[1], 10);
    const monthKey = m[2].replace(/\.$/, ""); // strip trailing dot if any
    const mon = THAI_MONTHS[monthKey] ?? THAI_MONTHS[m[2]];
    if (!mon) continue;
    const yRaw = m[3] ? parseInt(m[3], 10) : NaN;
    const y = Number.isFinite(yRaw) ? normalizeYear(yRaw, todayYear) : todayYear;
    const iso = makeIso(d, mon, y);
    if (iso) out.push({ isoDate: iso, day: d, month: mon, year: y, raw: m[0], kind: "thai_month" });
  }

  // 2) DD/MM/YY(YY) with delimiter / - .
  const reSlash = /(?<!\d)(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?!\d)/g;
  while ((m = reSlash.exec(text)) !== null) {
    const d = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const yRaw = parseInt(m[3], 10);
    const y = normalizeYear(yRaw, todayYear);
    const iso = makeIso(d, mon, y);
    if (iso) out.push({ isoDate: iso, day: d, month: mon, year: y, raw: m[0], kind: "slash" });
  }

  // 3a) 8-digit DDMMYYYY filename pattern (BE full year, e.g., 25072569)
  const reDdmmyyyy = /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g;
  while ((m = reDdmmyyyy.exec(text)) !== null) {
    const d = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const yRaw = parseInt(m[3], 10);
    if (mon < 1 || mon > 12) continue;
    if (d < 1 || d > 31) continue;
    const y = normalizeYear(yRaw, todayYear);
    const iso = makeIso(d, mon, y);
    if (iso) out.push({ isoDate: iso, day: d, month: mon, year: y, raw: m[0], kind: "ddmmyy" });
  }

  // 3b) 6-digit DDMMYY (filename/nickname pattern)
  const reDdmmyy = /(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/g;
  while ((m = reDdmmyy.exec(text)) !== null) {
    const d = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const yRaw = parseInt(m[3], 10);
    if (mon < 1 || mon > 12) continue;
    if (d < 1 || d > 31) continue;
    const y = normalizeYear(yRaw, todayYear);
    const iso = makeIso(d, mon, y);
    if (iso) out.push({ isoDate: iso, day: d, month: mon, year: y, raw: m[0], kind: "ddmmyy" });
  }

  return out;
}

