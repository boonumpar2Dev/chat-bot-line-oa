// Phase 1 — Post-Quote No-Reask Guard
//
// เมื่อลูกค้าอยู่ status=pending_confirm และมี "หลักฐานจริง" ว่าใบเสนอราคาถูกส่งแล้ว
// (admin/ai พูดถึงใบเสนอราคา หรือ admin แนบไฟล์ในบทสนทนาล่าสุด) —
// ลูกค้าถามเรื่องกำหนดการ/นัดเข้าดูพื้นที่/รายละเอียดงานที่ต้องอาศัยข้อมูล structured
// (venue/date/guest/event_type) → บอทต้อง handoff ให้แอดมิน ห้ามย้อนถามข้อมูล lead ซ้ำ.
//
// Pure function. ไม่มี I/O. ผู้เรียกต้อง:
//   • ตอบด้วย replyText
//   • ตั้ง ai_active=false ผ่าน shared handoff helper (reason=post_quote_noreask_guard)
//   • ใส่ marker "🤝 " ที่ last_message_snippet ให้ badge "รอแอดมินตอบ" ทำงานตาม rule เดิม
//   • return ก่อนเข้า AI
//
// Safer-default rollout: ทำงานกับลูกค้าทุกคนที่เข้าเงื่อนไข post-quote จริง
// (ไม่ผูกกับ Phase 2 cohort). ไม่ใช่ feature ทดลอง — เป็น correction ของ post-quote discipline.

import { hasPostQuoteConversationEvidence, type RecentConvLike } from "./ai-policy.ts";

export interface PostQuoteNoReaskGuardInput {
  lifecycle: string | null | undefined;
  messageText: string | null | undefined;
  recentConvs: RecentConvLike[] | null | undefined;
}

export interface PostQuoteNoReaskGuardResult {
  matched: boolean;
  replyText: string;
  reason: string;
  matchedPattern: string | null;
}

const REPLY_TEXT =
  "รับทราบค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานงานต่อนะคะ 🙏";

// รูปแบบคำถามที่ปกติจะทำให้ AI ย้อนถาม lead fields (venue/date/guest/event_type):
//   • เข้าดู/สำรวจ/มาดู พื้นที่/สถานที่/หน้างาน
//   • ทีมงาน/เจ้าหน้าที่ เข้ามา/จะมา/จะเข้า/ติดต่อ เมื่อไหร่/วันไหน
//   • กำหนดการงาน / รายละเอียดงาน / กำหนดการจัดงาน
//   • เรื่องเข้าดูสถานที่/สำรวจสถานที่/นัดดูงาน (site visit inquiry)
//
// ห้ามจับคำถามทั่วไป (แพ็กเกจ/ราคา/เมนู/ค่าส่ง/รวมอะไรบ้าง) — คำถามพวกนี้ AI ตอบได้.
const SITE_VISIT_RE =
  /(?:เข้า|มา|จะ|ขอ)?\s*(?:สำรวจ|ดู|เข้าดู|มาดู|ตรวจ|เยี่ยม)\s*(?:พื้นที่|สถานที่|หน้างาน|บ้าน|สถาน)/;
const SCHEDULE_TEAM_RE =
  /(?:ทีม(?:งาน)?|เจ้าหน้าที่|พนักงาน|admin|แอดมิน)[^\n]{0,25}?(?:จะ|เข้า|มา|ติดต่อ|โทร|นัด)[^\n]{0,15}?(?:เมื่อ|วันไหน|กี่โมง|ตอน|วัน)/;
const SCHEDULE_WORD_RE =
  /กำหนดการ(?:งาน)?|รายละเอียด(?:งาน|กำหนดการ|การจัดงาน)|นัด(?:หมาย|ดู|เข้า)\s*(?:งาน|พื้นที่|สถาน)/;
const SITE_VISIT_WHEN_RE =
  /(?:เข้า|มา|จะ|ขอ)?\s*(?:สำรวจ|ดู|เยี่ยม)[^\n]{0,10}?(?:พื้นที่|สถานที่|หน้างาน)[^\n]{0,15}?(?:วันไหน|เมื่อไหร่|กี่โมง|ตอนไหน)/;

interface Pat { re: RegExp; tag: string; }
const PATTERNS: Pat[] = [
  { re: SITE_VISIT_WHEN_RE, tag: "site-visit.when" },
  { re: SITE_VISIT_RE,      tag: "site-visit" },
  { re: SCHEDULE_TEAM_RE,   tag: "schedule.team" },
  { re: SCHEDULE_WORD_RE,   tag: "schedule.detail" },
];

export function evaluatePostQuoteNoReaskGuard(
  input: PostQuoteNoReaskGuardInput,
): PostQuoteNoReaskGuardResult {
  const empty: PostQuoteNoReaskGuardResult = {
    matched: false, replyText: "", reason: "", matchedPattern: null,
  };

  const lc = (input.lifecycle ?? "").toString().trim().toLowerCase();
  if (lc !== "pending_confirm") {
    return { ...empty, reason: `lifecycle-not-pending_confirm:${lc || "none"}` };
  }

  if (!hasPostQuoteConversationEvidence(input.recentConvs)) {
    return { ...empty, reason: "no-post-quote-evidence" };
  }

  const text = (input.messageText ?? "").toString();
  if (!text.trim()) return { ...empty, reason: "empty-message" };

  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return {
        matched: true,
        replyText: REPLY_TEXT,
        reason: `matched:${p.tag}`,
        matchedPattern: p.tag,
      };
    }
  }
  return { ...empty, reason: "no-pattern-match" };
}

export const __POST_QUOTE_NOREASK_DEFAULTS = { replyText: REPLY_TEXT };
