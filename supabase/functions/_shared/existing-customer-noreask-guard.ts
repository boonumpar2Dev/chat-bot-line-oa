// Phase 2A.1 — Existing Customer No-Reask Guard
//
// เมื่อลูกค้าเป็น "existing customer" (มีหลักฐานว่าเคยคุย/ให้ข้อมูล/เคยส่ง quotation ฯลฯ)
// และส่งข้อความประมาณว่า "เคยบอกไปแล้ว / แจ้งไปแล้ว / ตามที่คุยกัน" —
// ห้ามให้ AI ย้อนถาม lead fields (venue/date/guest_count/event_type/phone) ซ้ำ
// ต้อง handoff ให้แอดมินตรวจสอบข้อมูลเดิมและประสานงานต่อ.
//
// Pure function — ไม่มี I/O. Caller รับผิดชอบ:
//   • ส่ง replyText
//   • ตั้ง ai_active=false ผ่าน shared handoff helper
//   • ใส่ marker "🤝 " ที่ last_message_snippet
//   • return ก่อนเข้า AI
//
// Scope:
//   • ทำงานเฉพาะ existing customer (ดู isExistingCustomer)
//   • ห้ามทำงานเมื่อ new customer (status=new, ไม่มี history, ไม่มี structured data)
//   • ห้ามทำงานเมื่อลูกค้าเปิด "new cycle" (มีงานใหม่ / อีกงาน / รอบใหม่)
//
// ไม่แตะ: Phase 2A explicit date logic, quotation detection, OCR, PaymentSlipGuard,
//        AdminHandoffGuard, PostQuoteNoReaskGuard patterns, DB schema.

import { EXISTING_CYCLE_REPLIES } from "./existing-cycle-reply.ts";

export interface ExistingCustomerNoReaskConvLike {
  sender?: string | null;
  message?: string | null;
}

export interface ExistingCustomerFacts {
  phone?: string | null;
  event_date?: string | null;
  venue?: string | null;
  guest_count?: number | string | null;
  event_type?: string | null;
  clv_amount?: number | string | null;
}

export interface ExistingCustomerNoReaskGuardInput {
  lifecycle: string | null | undefined;
  messageText: string | null | undefined;
  recentConvs: ExistingCustomerNoReaskConvLike[] | null | undefined;
  facts?: ExistingCustomerFacts | null;
}

export interface ExistingCustomerNoReaskGuardResult {
  matched: boolean;
  replyText: string;
  reason: string;
  matchedPattern: string | null;
  isExistingCustomer: boolean;
  isNewCycle: boolean;
}

const REPLY_TEXT = EXISTING_CYCLE_REPLIES.existing_discussion;

// สถานะที่ถือว่า "ยังใหม่" — ห้าม guard ทำงานถ้า status เป็นค่าเหล่านี้ *และ* ไม่มีสัญญาณอื่น
const NEW_STATUSES = new Set(["", "new", "inquiry"]);

// รูปแบบ "เคยบอก/เคยแจ้ง/ตามที่คุยกัน/ข้อมูลเดิม" — ต้องระบุชัดว่าเคยให้ข้อมูลแล้ว
// ต้องระวังไม่จับคำถามทั่วไปหรือ ack ("รับทราบค่ะ", "โอเคค่ะ")
const ALREADY_TOLD_PATTERNS: { re: RegExp; tag: string }[] = [
  { re: /เคย\s*(?:บอก|แจ้ง|ส่ง|ให้)(?:ข้อมูล|รายละเอียด)?(?:ไป)?(?:แล้ว|ก่อนหน้า)/, tag: "already-told.explicit" },
  { re: /(?:บอก|แจ้ง|ส่ง)(?:ข้อมูล|รายละเอียด)?\s*(?:ไป)?(?:ก่อนหน้า(?:นี้)?|เมื่อกี้)\s*แล้ว/, tag: "already-told.earlier" },
  { re: /(?:แจ้ง|บอก|ส่ง)\s*(?:ข้อมูล|รายละเอียด|ไว้|ให้)[^\n]{0,20}?แล้ว/, tag: "already-told.given" },
  { re: /คุย(?:กัน)?\s*(?:ไว้|กันไว้)\s*แล้ว/, tag: "already-told.discussed" },
  { re: /ตามที่(?:เคย)?\s*(?:คุย|แจ้ง|บอก|ส่ง)(?:กัน)?(?:ไว้)?/, tag: "already-told.per-prior" },
  { re: /ข้อมูล(?:เดิม|เก่า)(?:ค่ะ|ครับ|นะ|น่ะ)?/, tag: "already-told.same-data" },
  { re: /(?:แอดมิน|เจ้าหน้าที่)\s*มี\s*ข้อมูล(?:แล้ว|อยู่แล้ว)/, tag: "already-told.admin-has" },
  { re: /(?:พี่|น้อง)?\s*เคย(?:บอก|แจ้ง|ให้|ส่ง)(?:ไป)?(?:แล้ว)?\s*(?:นะ|น่ะ|ค่ะ|ครับ|ไง)?/, tag: "already-told.polite" },
];

// รูปแบบ "งานใหม่ / รอบใหม่ / อีกงาน" — ถ้าเจอ → skip guard (ให้ AI ทำ lead flow ใหม่ได้)
const NEW_CYCLE_PATTERNS: RegExp[] = [
  /มี\s*งาน\s*ใหม่/,
  /(?:งาน|ออร์เดอร์|order)\s*(?:รอบ|ครั้ง)\s*ใหม่/,
  /ขอ\s*(?:สอบถาม|ถาม|ราคา|เสนอราคา|ใบเสนอราคา)\s*(?:อีก|เพิ่ม)\s*(?:งาน|ครั้ง|รอบ|ออเดอร์|ออร์เดอร์)/,
  /(?:อีก|เพิ่ม)\s*(?:งาน|ออร์เดอร์|ออเดอร์|รอบ)/,
  /ครั้ง\s*นี้\s*(?:จัด|จะจัด|อยาก|ต้องการ)/,
  /งาน\s*ใหม่/,
];

function hasStructuredEvidence(facts: ExistingCustomerFacts | null | undefined): boolean {
  if (!facts) return false;
  const nonEmpty = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
  return (
    nonEmpty(facts.phone) ||
    nonEmpty(facts.event_date) ||
    nonEmpty(facts.venue) ||
    nonEmpty(facts.guest_count) ||
    nonEmpty(facts.event_type) ||
    nonEmpty(facts.clv_amount)
  );
}

function hasAdminOrAiHistory(convs: ExistingCustomerNoReaskConvLike[] | null | undefined): boolean {
  if (!Array.isArray(convs) || convs.length === 0) return false;
  for (const c of convs) {
    const s = (c?.sender ?? "").toString().toLowerCase();
    if (s === "admin" || s === "ai" || s === "assistant" || s === "staff") return true;
  }
  return false;
}

export function detectIsExistingCustomer(
  input: Pick<ExistingCustomerNoReaskGuardInput, "lifecycle" | "recentConvs" | "facts">,
): boolean {
  const lc = (input.lifecycle ?? "").toString().trim().toLowerCase();
  if (lc && !NEW_STATUSES.has(lc)) return true;
  if (hasAdminOrAiHistory(input.recentConvs)) return true;
  if (hasStructuredEvidence(input.facts ?? null)) return true;
  return false;
}

export function detectIsNewCycle(messageText: string | null | undefined): boolean {
  const t = (messageText ?? "").toString();
  if (!t.trim()) return false;
  for (const re of NEW_CYCLE_PATTERNS) if (re.test(t)) return true;
  return false;
}

export function evaluateExistingCustomerNoReaskGuard(
  input: ExistingCustomerNoReaskGuardInput,
): ExistingCustomerNoReaskGuardResult {
  const isExisting = detectIsExistingCustomer(input);
  const isNewCycle = detectIsNewCycle(input.messageText);
  const empty: ExistingCustomerNoReaskGuardResult = {
    matched: false,
    replyText: "",
    reason: "",
    matchedPattern: null,
    isExistingCustomer: isExisting,
    isNewCycle,
  };

  const text = (input.messageText ?? "").toString();
  if (!text.trim()) return { ...empty, reason: "empty-message" };

  if (!isExisting) return { ...empty, reason: "not-existing-customer" };
  if (isNewCycle) return { ...empty, reason: "new-cycle-detected" };

  for (const p of ALREADY_TOLD_PATTERNS) {
    if (p.re.test(text)) {
      return {
        matched: true,
        replyText: REPLY_TEXT,
        reason: `matched:${p.tag}`,
        matchedPattern: p.tag,
        isExistingCustomer: true,
        isNewCycle: false,
      };
    }
  }
  return { ...empty, reason: "no-pattern-match" };
}

export const __EXISTING_CUSTOMER_NOREASK_DEFAULTS = { replyText: REPLY_TEXT };
