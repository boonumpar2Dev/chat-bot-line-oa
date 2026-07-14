// Existing-Cycle Resolver
//
// เป้าหมาย: ตัดสินให้ชัดว่า "ลูกค้าคนนี้อยู่ใน current cycle (มีงาน/ใบเสนอราคาที่กำลังคุยกันอยู่)
// หรือเป็นแค่ลูกค้าที่ 'เคย' มี evidence เก่าเท่านั้น" — เพื่อให้ layer ปลายทาง
// (pre-AI hard-instruction + post-AI enforcement) เปิด/ปิดกฎ "ห้าม reask lead fields"
// ได้อย่างปลอดภัย ไม่ทับ new-cycle จริง.
//
// Pure function. ไม่มี I/O. Caller ต้องเตรียม input จาก DB/webhook ให้ครบ.
//
// เกณฑ์ (ยึดตามข้อกำหนดผู้ใช้ ยาม 14 ก.ค. 2569):
//   Strong evidence — เปิด existingCycleMode ได้เดี่ยว:
//     A. currentStatus ∈ { pending_confirm, pending_quote, confirmed, confirmed_returning }
//     B. recent admin/AI text match POST_QUOTE_TEXT_RE
//        OR recent admin file marker ใกล้ข้อความ quotation/package/menu/price/deposit
//     C. currentEvent (customer_events แถวที่ยังไม่ completed / เป็น current)
//   Supporting evidence — ใช้ diagnostics เท่านั้น ห้ามเปิด mode เดี่ยว:
//     - customer_status_log เคยเป็น pending_confirm/confirmed
//     - customer_events เก่า (completed แล้ว)
//     - มี admin conversation history
//     - มี structured customer facts (phone/venue/…)
//
// Precedence:
//   1) explicitNewCycle=true จากข้อความปัจจุบัน → mode=false (ไม่ suppress)
//   2) current status ∈ strong set → mode=true
//   3) strong recent quotation evidence → mode=true
//   4) currentEvent evidence → mode=true
//   5) else → mode=false
//
// ข้อสำคัญ (per user):
//   - explicit new cycle ต้องมี "ข้อความชัดเจน" (งานใหม่/รอบใหม่/อีกงาน …)
//   - date/venue/guest ใหม่เดี่ยว ๆ ไม่นับเป็น new cycle
//   - historical status log หรือ historical event เดี่ยว ๆ ไม่นับเป็น current cycle

import { detectIsNewCycle } from "./existing-customer-noreask-guard.ts";
import type { RecentConvLike } from "./ai-policy.ts";

const STRONG_STATUSES = new Set([
  "pending_confirm",
  "pending_quote",
  "confirmed",
  "confirmed_returning",
]);

// Same regex family as ai-policy.ts POST_QUOTE_TEXT_RE (kept in sync intentionally).
const POST_QUOTE_TEXT_RE =
  /ใบเสนอราคา|เสนอราคา|quote|ราคารวม|รายละเอียดราคา|แนบไฟล์|แก้ใบเสนอ|ยอดรวม|สรุปราคา/i;

const ADMIN_FILE_MARKER_RE = /\[(รูปภาพ|วิดีโอ|ไฟล์[^\]]*)\]|📎/;

// "ใกล้ข้อความเรื่อง quotation/package/menu/price/deposit" — เช็คใน 6 turn ล่าสุด
// รวมทั้ง admin file marker + คำสำคัญเดียวกับ POST_QUOTE_TEXT_RE + package/menu/deposit.
const QUOTE_NEIGHBOURHOOD_RE =
  /ใบเสนอราคา|เสนอราคา|quote|ราคารวม|ยอดรวม|สรุปราคา|แพ็กเกจ|package|เมนู|menu|มัดจำ|deposit|โอน/i;

export interface CycleResolverInput {
  currentStatus: string | null | undefined;
  messageText: string | null | undefined;
  recentConvs: RecentConvLike[] | null | undefined;
  /** true if customer has a customer_events row that is NOT completed (current event). */
  hasCurrentEvent?: boolean | null;
  /** Supporting-only signals — never open mode alone. */
  supporting?: {
    hasHistoricalStatusLog?: boolean | null;
    hasHistoricalCompletedEvent?: boolean | null;
    hasAdminConversationHistory?: boolean | null;
    hasStructuredFacts?: boolean | null;
  } | null;
}

export interface CycleResolverResult {
  existingCycleMode: boolean;
  explicitNewCycle: boolean;
  /** Which strong evidence(s) opened the mode. Empty when mode=false. */
  strongEvidence: string[];
  /** Diagnostics only. Never influences mode. */
  supportingEvidence: string[];
  reason: string;
}

function hasStrongQuotationEvidence(
  convs: RecentConvLike[] | null | undefined,
): boolean {
  if (!Array.isArray(convs) || convs.length === 0) return false;
  const last6 = convs.slice(0, 6);
  // A) admin/ai พูดถึงใบเสนอราคาโดยตรง
  for (const c of last6) {
    const s = (c?.sender || "").toLowerCase();
    if (s !== "admin" && s !== "ai") continue;
    if (POST_QUOTE_TEXT_RE.test(c?.message || "")) return true;
  }
  // B) admin แนบไฟล์ ใน 3 turn + มี quote-neighbourhood keyword ใน 6 turn
  const last3 = convs.slice(0, 3);
  let hasAdminFile = false;
  for (const c of last3) {
    if ((c?.sender || "").toLowerCase() !== "admin") continue;
    if (ADMIN_FILE_MARKER_RE.test(c?.message || "")) { hasAdminFile = true; break; }
  }
  if (!hasAdminFile) return false;
  for (const c of last6) {
    const s = (c?.sender || "").toLowerCase();
    if (s !== "admin" && s !== "ai") continue;
    if (QUOTE_NEIGHBOURHOOD_RE.test(c?.message || "")) return true;
  }
  return false;
}

export function resolveExistingCycle(input: CycleResolverInput): CycleResolverResult {
  const status = (input.currentStatus ?? "").toString().trim().toLowerCase();
  const explicitNewCycle = detectIsNewCycle(input.messageText ?? "");

  // Supporting diagnostics (never open mode alone)
  const supportingEvidence: string[] = [];
  const sup = input.supporting ?? {};
  if (sup.hasHistoricalStatusLog) supportingEvidence.push("historical_status_log");
  if (sup.hasHistoricalCompletedEvent) supportingEvidence.push("historical_completed_event");
  if (sup.hasAdminConversationHistory) supportingEvidence.push("admin_conversation_history");
  if (sup.hasStructuredFacts) supportingEvidence.push("structured_customer_facts");

  // 1) explicit new cycle overrides everything
  if (explicitNewCycle) {
    return {
      existingCycleMode: false,
      explicitNewCycle: true,
      strongEvidence: [],
      supportingEvidence,
      reason: "explicit_new_cycle",
    };
  }

  const strong: string[] = [];

  // 2) current status strong set
  if (STRONG_STATUSES.has(status)) strong.push(`status:${status}`);

  // 3) recent quotation evidence
  if (hasStrongQuotationEvidence(input.recentConvs)) strong.push("recent_quotation");

  // 4) current event structured
  if (input.hasCurrentEvent === true) strong.push("current_event");

  if (strong.length > 0) {
    return {
      existingCycleMode: true,
      explicitNewCycle: false,
      strongEvidence: strong,
      supportingEvidence,
      reason: `strong:${strong.join(",")}`,
    };
  }

  return {
    existingCycleMode: false,
    explicitNewCycle: false,
    strongEvidence: [],
    supportingEvidence,
    reason:
      supportingEvidence.length > 0
        ? `supporting_only:${supportingEvidence.join(",")}`
        : "no_evidence",
  };
}

/**
 * Prompt block appended to customerContextBlock when existingCycleMode is ON.
 * Rules per spec §5. Deterministic — no dynamic customer data injected.
 */
export function buildExistingCyclePolicyBlock(): string {
  return `[EXISTING_CYCLE_MODE] ลูกค้ารายนี้อยู่ใน current cycle (มีงาน/ใบเสนอราคาที่กำลังคุยกันอยู่) — ไม่ใช่ lead ใหม่

กฎ (สำคัญมาก ขึ้นเหนือทุกกฎการถามข้อมูล):
- ตอบเฉพาะคำถามปัจจุบันของลูกค้าเท่านั้น — ห้ามเริ่ม lead collection ใหม่
- **ห้ามถามซ้ำ**: event_date / event_type / venue / guest_count / phone แม้ในระบบยังว่างก็ตาม
- DB field ที่ null **ห้ามเป็นเหตุ**ถามซ้ำ — ให้ประสานทีมงานตรวจจากใบเสนอราคา/บันทึกภายในแทน
- ถ้า context ไม่พอตอบ → **ห้ามเดา ห้ามยืนยัน ห้ามอ้างเมนู/วัน/ยอด/สถานที่ที่ไม่ปรากฏชัดในบทสนทนา**
- ถ้าประเด็นเป็นการเปลี่ยน/ยืนยัน/อนุมัติ → คืนเป็น handoff intent ให้ทีมงาน ห้ามยืนยันเอง`;
}
