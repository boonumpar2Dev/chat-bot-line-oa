// Patch 2.9.1 — AdminHandoffGuard
//
// Deterministic pre-AI guard. When a customer in an allowed lifecycle sends
// a message with a clear intent that requires human staff (change request,
// staff coordination, confirmed-context question, payment verification),
// the webhook must:
//   1. Reply with a short deterministic acknowledgement
//   2. Skip the AI call entirely
//   3. Force-disable AI via shared handoff helper (reason="admin_handoff_guard")
//
// Scope constraints (from Patch 2.9.1 spec):
//   • Explicit lifecycle allow-list only: pending_confirm, confirmed, confirmed_returning
//   • No confidence-based / generic keyword handoff yet
//   • No admin UI in this patch — config read-only from app_settings.admin_handoff_guard
//     with safe defaults; the helper never mutates settings.
//
// This module is PURE: it inspects inputs and returns a decision. All side
// effects (send LINE reply, update DB, log audit) belong to the caller.

export type AdminHandoffCategory =
  | "change_request"
  | "staff_action"
  | "confirmed_missing_context"
  | "payment_verify";

export interface AdminHandoffGuardConfig {
  enabled?: boolean;
  allowed_lifecycles?: string[];
  reply_standard?: string;
  reply_verify?: string;
}

export interface AdminHandoffGuardInput {
  lifecycle: string | null | undefined;
  messageText: string | null | undefined;
  config?: AdminHandoffGuardConfig | null;
}

export interface AdminHandoffGuardResult {
  matched: boolean;
  category: AdminHandoffCategory | null;
  replyText: string;
  reason: string;
  matchedPattern: string | null;
}

const DEFAULT_ALLOWED_LIFECYCLES = [
  "pending_confirm",
  "confirmed",
  "confirmed_returning",
];

// ── Section 5 Wording Sweep (2026-07) ────────────────────────────────
// Deterministic handoff wording MUST NOT begin with "รับทราบค่ะ" because
// that phrasing has been read by customers as an approval/acknowledgement
// of the action they asked for. Route every category through an intent
// bucket that mirrors EXISTING_CYCLE_REPLIES so we have ONE source of
// wording across guards.
//
// Buckets:
//   • general  — change requests / staff coordination / complaints
//   • schedule — site visit / appointment / schedule / details
//   • menu     — customer wants to choose/adjust menu items
//   • verify   — verification of payment/document/tax without confirmation
//
// The `verify` bucket is guard-specific (payment/tax evidence check) and
// intentionally does NOT reuse EXISTING_CYCLE_REPLIES because the caller
// hasn't seen the evidence yet — wording says we will check, not confirm.
const DEFAULT_REPLY_GENERAL =
  "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานกลับนะคะ 🙏";
const DEFAULT_REPLY_SCHEDULE =
  "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดนัดหมายและประสานกลับนะคะ 🙏";
const DEFAULT_REPLY_MENU =
  "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายการเมนูและประสานกลับนะคะ 🙏";
const DEFAULT_REPLY_VERIFY =
  "เดี๋ยวเจ้าหน้าที่ตรวจสอบข้อมูลและประสานกลับนะคะ 🙏";

// Back-compat aliases (kept for legacy config keys)
const DEFAULT_REPLY_STANDARD = DEFAULT_REPLY_GENERAL;

export type AdminHandoffReplyIntent = "general" | "schedule" | "menu" | "verify";

interface PatternEntry {
  re: RegExp;
  category: AdminHandoffCategory;
  intent: AdminHandoffReplyIntent;
  tag: string;
}

// Order matters: first match wins. More-specific patterns come first.
const PATTERNS: PatternEntry[] = [
  // ── Payment verification (most specific) ─────────────────────────────
  { re: /(?:เช็ก|เช็ค|ตรวจสอบ|ยืนยัน)\s*(?:ยอด|มัดจำ|เงิน|โอน|การชำระ|การจ่าย)/, category: "payment_verify", intent: "verify", tag: "payment.verify" },
  { re: /(?:โอน|จ่าย|ชำระ)(?:\s*มัดจำ)?\s*(?:แล้ว|เรียบร้อย)/, category: "payment_verify", intent: "verify", tag: "payment.paid" },
  { re: /มัดจำ.{0,15}(?:เช็ก|เช็ค|ตรวจ|ยอด|ยืนยัน)/, category: "payment_verify", intent: "verify", tag: "payment.deposit" },

  // ── Confirmed missing structured context (schedule/site) ────────────
  { re: /ทีม(?:งาน)?[^\n]{0,20}?(?:เข้า|มา|จะ)[^\n]{0,15}?(?:ดู|พื้นที่|สถาน)/, category: "confirmed_missing_context", intent: "schedule", tag: "context.team-site" },
  { re: /กำหนดการ(?:งาน)?/, category: "confirmed_missing_context", intent: "schedule", tag: "context.schedule" },
  { re: /รายละเอียด(?:งาน|กำหนดการ|การจัดงาน)/, category: "confirmed_missing_context", intent: "schedule", tag: "context.details" },

  // ── Change request (after already-agreed things) ─────────────────────
  //   change.menu-replace → menu bucket (customer specifically talks about เมนู/อาหาร/รายการ)
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*เปลี่ยน\s*(?:เมนู|รายการ|อาหาร)/, category: "change_request", intent: "menu", tag: "change.menu-replace" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*(?:เพิ่ม|ลด)\s*(?:รายการ|เมนู)/, category: "change_request", intent: "menu", tag: "change.menu-count" },
  //   other change requests → general
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*เปลี่ยน\s*(?:สถาน(?:ที่)?|วัน|เวลา|จำนวน|แขก|แพ็?ก(?:เกจ)?|ที่จัด)/, category: "change_request", intent: "general", tag: "change.replace" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*(?:เพิ่ม|ลด)\s*(?:จำนวน|แขก|โต๊ะ)/, category: "change_request", intent: "general", tag: "change.count" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*เลื่อน(?:วัน|เวลา|งาน|จัดงาน|กำหนด)/, category: "change_request", intent: "schedule", tag: "change.postpone" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*ยกเลิก(?:งาน|ออร์เดอร์|รายการ|การจัดงาน)/, category: "change_request", intent: "general", tag: "change.cancel" },
  //   document change → verify (we don't confirm the change was made)
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*แก้(?:ไข)?\s*(?:ชื่อ|ที่อยู่|เบอร์|ใบเสนอราคา|ใบเสนอ|เอกสาร|ราคา|รายการ)/, category: "change_request", intent: "verify", tag: "change.doc" },

  // ── Staff action (needs human coordination) ─────────────────────────
  { re: /นัด\s*(?:ดู|เลือก|คุย|เข้า|หมาย)/, category: "staff_action", intent: "schedule", tag: "staff.appointment" },
  { re: /(?:เข้า)?ดู(?:พื้นที่|สถานที่|หน้างาน)/, category: "staff_action", intent: "schedule", tag: "staff.site-visit" },
  { re: /เลือก(?:เมนู|รายการอาหาร)/, category: "staff_action", intent: "menu", tag: "staff.menu-select" },
  { re: /(?:ประสาน|ติดต่อ)(?:งาน)?\s*(?:ทีม|หน้างาน|เจ้าหน้าที่)/, category: "staff_action", intent: "general", tag: "staff.coord" },
  { re: /(?:ใบกำกับภาษี|ออกใบกำกับ|ขอใบกำกับ)/, category: "staff_action", intent: "verify", tag: "staff.tax-invoice" },
  { re: /(?:ร้องเรียน|มีปัญหา|เกิดปัญหา|มีเรื่อง(?:ร้องเรียน|จะแจ้ง))/, category: "staff_action", intent: "general", tag: "staff.complaint" },
];

function normalizeLifecycles(cfg: AdminHandoffGuardConfig | null | undefined): string[] {
  const arr = cfg?.allowed_lifecycles;
  if (Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === "string")) {
    return arr as string[];
  }
  return DEFAULT_ALLOWED_LIFECYCLES;
}

function pickReplyFor(
  intent: AdminHandoffReplyIntent,
  cfg: AdminHandoffGuardConfig | null | undefined,
): string {
  // Legacy config overrides — reply_standard maps to general, reply_verify to verify.
  const legacyStandard = (typeof cfg?.reply_standard === "string" && cfg!.reply_standard!.trim())
    ? cfg!.reply_standard!.trim() : null;
  const legacyVerify = (typeof cfg?.reply_verify === "string" && cfg!.reply_verify!.trim())
    ? cfg!.reply_verify!.trim() : null;

  switch (intent) {
    case "schedule": return DEFAULT_REPLY_SCHEDULE;
    case "menu":     return DEFAULT_REPLY_MENU;
    case "verify":   return legacyVerify ?? DEFAULT_REPLY_VERIFY;
    case "general":
    default:         return legacyStandard ?? DEFAULT_REPLY_GENERAL;
  }
}

export function evaluateAdminHandoffGuard(
  input: AdminHandoffGuardInput,
): AdminHandoffGuardResult {
  const cfg = input.config ?? null;
  const enabled = cfg?.enabled !== false; // default: enabled

  const empty: AdminHandoffGuardResult = {
    matched: false, category: null, replyText: "", reason: "", matchedPattern: null,
  };

  if (!enabled) return { ...empty, reason: "disabled" };

  const lc = (input.lifecycle ?? "").toString().trim();
  const allowed = normalizeLifecycles(cfg);
  if (!lc || !allowed.includes(lc)) {
    return { ...empty, reason: `lifecycle-not-allowed:${lc || "none"}` };
  }

  const text = (input.messageText ?? "").toString();
  if (!text.trim()) return { ...empty, reason: "empty-message" };

  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return {
        matched: true,
        category: p.category,
        replyText: pickReplyFor(p.intent, cfg),
        reason: `matched:${p.tag}`,
        matchedPattern: p.tag,
      };
    }
  }

  return { ...empty, reason: "no-pattern-match" };
}

// Exported for tests / debug: read defaults without touching internals.
export const __ADMIN_HANDOFF_GUARD_DEFAULTS = {
  allowedLifecycles: DEFAULT_ALLOWED_LIFECYCLES,
  replyStandard: DEFAULT_REPLY_STANDARD,   // legacy alias → general
  replyGeneral: DEFAULT_REPLY_GENERAL,
  replySchedule: DEFAULT_REPLY_SCHEDULE,
  replyMenu: DEFAULT_REPLY_MENU,
  replyVerify: DEFAULT_REPLY_VERIFY,
};
