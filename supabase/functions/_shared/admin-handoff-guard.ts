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

const DEFAULT_REPLY_STANDARD =
  "รับทราบค่ะ เดี๋ยวเจ้าหน้าที่ดูแลประสานงานต่อนะคะ 🙏";
const DEFAULT_REPLY_VERIFY =
  "รับทราบค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานงานต่อนะคะ 🙏";

interface PatternEntry {
  re: RegExp;
  category: AdminHandoffCategory;
  needsVerify: boolean;
  tag: string;
}

// Order matters: first match wins. More-specific patterns come first.
const PATTERNS: PatternEntry[] = [
  // ── Payment verification (most specific) ─────────────────────────────
  { re: /(?:เช็ก|เช็ค|ตรวจสอบ|ยืนยัน)\s*(?:ยอด|มัดจำ|เงิน|โอน|การชำระ|การจ่าย)/, category: "payment_verify", needsVerify: true, tag: "payment.verify" },
  { re: /(?:โอน|จ่าย|ชำระ)(?:\s*มัดจำ)?\s*(?:แล้ว|เรียบร้อย)/, category: "payment_verify", needsVerify: true, tag: "payment.paid" },
  { re: /มัดจำ.{0,15}(?:เช็ก|เช็ค|ตรวจ|ยอด|ยืนยัน)/, category: "payment_verify", needsVerify: true, tag: "payment.deposit" },

  // ── Confirmed missing structured context ────────────────────────────
  // "ทีมจะเข้ามาดูพื้นที่วันไหน" / "ทีมมาดูสถานที่"
  { re: /ทีม(?:งาน)?[^\n]{0,20}?(?:เข้า|มา|จะ)[^\n]{0,15}?(?:ดู|พื้นที่|สถาน)/, category: "confirmed_missing_context", needsVerify: true, tag: "context.team-site" },
  { re: /กำหนดการ(?:งาน)?/, category: "confirmed_missing_context", needsVerify: true, tag: "context.schedule" },
  { re: /รายละเอียด(?:งาน|กำหนดการ|การจัดงาน)/, category: "confirmed_missing_context", needsVerify: true, tag: "context.details" },

  // ── Change request (after already-agreed things) ─────────────────────
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*เปลี่ยน\s*(?:สถาน(?:ที่)?|วัน|เวลา|จำนวน|แขก|เมนู|รายการ|แพ็?ก(?:เกจ)?|อาหาร|ที่จัด)/, category: "change_request", needsVerify: false, tag: "change.replace" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*(?:เพิ่ม|ลด)\s*(?:จำนวน|แขก|โต๊ะ|รายการ|เมนู)/, category: "change_request", needsVerify: false, tag: "change.count" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*เลื่อน(?:วัน|เวลา|งาน|จัดงาน|กำหนด)/, category: "change_request", needsVerify: false, tag: "change.postpone" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*ยกเลิก(?:งาน|ออร์เดอร์|รายการ|การจัดงาน)/, category: "change_request", needsVerify: false, tag: "change.cancel" },
  { re: /(?:ขอ|อยาก|รบกวน|ช่วย)?\s*แก้(?:ไข)?\s*(?:ชื่อ|ที่อยู่|เบอร์|ใบเสนอราคา|ใบเสนอ|เอกสาร|ราคา|รายการ)/, category: "change_request", needsVerify: false, tag: "change.doc" },

  // ── Staff action (needs human coordination) ─────────────────────────
  { re: /นัด\s*(?:ดู|เลือก|คุย|เข้า|หมาย)/, category: "staff_action", needsVerify: false, tag: "staff.appointment" },
  { re: /(?:เข้า)?ดู(?:พื้นที่|สถานที่|หน้างาน)/, category: "staff_action", needsVerify: false, tag: "staff.site-visit" },
  { re: /เลือก(?:เมนู|รายการอาหาร)/, category: "staff_action", needsVerify: false, tag: "staff.menu-select" },
  { re: /(?:ประสาน|ติดต่อ)(?:งาน)?\s*(?:ทีม|หน้างาน|เจ้าหน้าที่)/, category: "staff_action", needsVerify: false, tag: "staff.coord" },
  { re: /(?:ใบกำกับภาษี|ออกใบกำกับ|ขอใบกำกับ)/, category: "staff_action", needsVerify: false, tag: "staff.tax-invoice" },
  { re: /(?:ร้องเรียน|มีปัญหา|เกิดปัญหา|มีเรื่อง(?:ร้องเรียน|จะแจ้ง))/, category: "staff_action", needsVerify: false, tag: "staff.complaint" },
];

function normalizeLifecycles(cfg: AdminHandoffGuardConfig | null | undefined): string[] {
  const arr = cfg?.allowed_lifecycles;
  if (Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === "string")) {
    return arr as string[];
  }
  return DEFAULT_ALLOWED_LIFECYCLES;
}

export function evaluateAdminHandoffGuard(
  input: AdminHandoffGuardInput,
): AdminHandoffGuardResult {
  const cfg = input.config ?? null;
  const enabled = cfg?.enabled !== false; // default: enabled
  const replyStandard = (typeof cfg?.reply_standard === "string" && cfg!.reply_standard!.trim())
    ? cfg!.reply_standard!.trim() : DEFAULT_REPLY_STANDARD;
  const replyVerify = (typeof cfg?.reply_verify === "string" && cfg!.reply_verify!.trim())
    ? cfg!.reply_verify!.trim() : DEFAULT_REPLY_VERIFY;

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
        replyText: p.needsVerify ? replyVerify : replyStandard,
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
  replyStandard: DEFAULT_REPLY_STANDARD,
  replyVerify: DEFAULT_REPLY_VERIFY,
};
