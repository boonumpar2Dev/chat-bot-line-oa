// Shared deterministic reply wording for the existing-cycle policy.
//
// All wording is centralised here so that:
//   • PostQuoteNoReaskGuard, ExistingCustomerNoReaskGuard, and the post-AI
//     enforcement layer all pull from the SAME source.
//   • None of the phrasing uses the forbidden opener "รับทราบ".
//   • Reply-type selection is driven ONLY by the customer's current intent
//     (their most recent message), never by which DB field is missing.
//
// Pure module — no I/O, no side effects.

export type ExistingCycleReplyIntent =
  | "general"
  | "existing_discussion"
  | "menu"
  | "schedule";

export const EXISTING_CYCLE_REPLIES: Record<ExistingCycleReplyIntent, string> = {
  general: "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานกลับนะคะ 🙏",
  existing_discussion: "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดที่คุยไว้และประสานกลับนะคะ 🙏",
  menu: "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายการเมนูและประสานกลับนะคะ 🙏",
  schedule: "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดนัดหมายและประสานกลับนะคะ 🙏",
};

// Intent detectors — ordered from most specific to most generic.
const EXISTING_DISCUSSION_RE =
  /เคย\s*(?:บอก|แจ้ง|ส่ง|ให้)|ตามที่(?:เคย)?\s*(?:คุย|แจ้ง|บอก|ส่ง)|ข้อมูล(?:เดิม|เก่า)|(?:แอดมิน|เจ้าหน้าที่)\s*มี\s*ข้อมูล|คุย(?:กัน)?\s*(?:ไว้|กันไว้)\s*แล้ว/;

const MENU_RE = /เมนู|อาหาร|จาน|กับข้าว|ของหวาน|เครื่องดื่ม|รายการอาหาร/;

const SCHEDULE_RE =
  /(?:เข้า|มา|จะ|ขอ)?\s*(?:สำรวจ|ดู|เข้าดู|มาดู|ตรวจ|เยี่ยม)\s*(?:พื้นที่|สถานที่|หน้างาน|บ้าน|สถาน)|กำหนดการ|นัด(?:หมาย|ดู|เข้า)|(?:ทีม(?:งาน)?|เจ้าหน้าที่|พนักงาน|แอดมิน)[^\n]{0,25}?(?:จะ|เข้า|มา|ติดต่อ|โทร|นัด)[^\n]{0,15}?(?:เมื่อ|วันไหน|กี่โมง|ตอน|วัน)/;

/**
 * Pick the reply intent purely from the customer's current message.
 * Priority: menu > schedule > existing_discussion > general.
 * (menu wins over schedule because "เมนู" is a concrete deliverable —
 *  scheduling wording often co-occurs with the menu discussion.)
 */
export function pickExistingCycleReplyIntent(
  messageText: string | null | undefined,
): ExistingCycleReplyIntent {
  const t = (messageText ?? "").toString();
  if (!t.trim()) return "general";
  if (MENU_RE.test(t)) return "menu";
  if (SCHEDULE_RE.test(t)) return "schedule";
  if (EXISTING_DISCUSSION_RE.test(t)) return "existing_discussion";
  return "general";
}

export function pickExistingCycleReply(
  messageText: string | null | undefined,
): { intent: ExistingCycleReplyIntent; text: string } {
  const intent = pickExistingCycleReplyIntent(messageText);
  return { intent, text: EXISTING_CYCLE_REPLIES[intent] };
}
