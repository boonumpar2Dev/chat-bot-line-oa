// Existing-Cycle Post-AI Enforcement (structured atomic handoff)
//
// รันหลัง callAI() ก่อนส่ง reply — เมื่อ existingCycleMode=true AND explicitNewCycle=false.
//
// A) Fake-approval detection (intent-gated):
//    - จับคำอ้าง approval/confirmation/change ที่ไม่มี server-side evidence เช่น
//      "ได้เลยค่ะ / ได้แน่นอนค่ะ / ใช้ได้ค่ะ / เมนูเดิมใช้ได้ค่ะ / ยืนยันให้แล้ว /
//       เปลี่ยนให้เรียบร้อยแล้ว / จองให้แล้ว / อนุมัติให้แล้ว / สามารถเปลี่ยนได้ค่ะ …"
//    - Trigger เฉพาะเมื่อลูกค้าถามในเชิงขออนุมัติ/เปลี่ยนแปลง/ยืนยัน
//      (ได้ไหม / ใช้ได้ไหม / เปลี่ยนได้ไหม / ยังใช้ได้ไหม / เอาตามเดิมได้ไหม …)
//      หรือคำตอบอ้าง "เรียบร้อยแล้ว / ให้แล้ว" ที่เข้าข่าย fake completion (แม้ intent ไม่ชัด)
//    → replace ทั้งบับเบิลด้วย deterministic handoff (ห้าม salvage)
//
// B) Lead-field reask ต่อท้าย (venue/date/guest/event_type/phone):
//    → strip ได้ **เฉพาะเมื่อ segment แยกได้ชัดเจน**
//    → ถ้าแยกไม่มั่นใจ → replace ทั้งบับเบิล
//
// C) Focused schedule/availability: เมื่อลูกค้าถาม "ว่างไหม / เช็กคิว" — ต้อง strip
//    ประโยคขอเบอร์/callback/lead fields ต่อท้าย. ถ้า strip ไม่ได้ → schedule handoff.
//
// Pure function. Caller รับผิดชอบ persist patch, push LINE, suppress media.

import {
  EXISTING_CYCLE_REPLIES,
  pickExistingCycleReplyIntent,
  type ExistingCycleReplyIntent,
} from "./existing-cycle-reply.ts";
import { parseThaiDateCandidates } from "./ai-policy.ts";

// Deterministic Thai month names for availability reply formatting.
const THAI_MONTH_NAMES = [
  "", "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];

/**
 * Format a Thai-date candidate into wording used in the deterministic
 * availability reply: "25 กรกฎาคม" (no year — customer wording rarely includes one).
 */
function formatThaiDateShort(day: number, month: number): string {
  if (!day || !month || month < 1 || month > 12) return "";
  return `${day} ${THAI_MONTH_NAMES[month]}`;
}

// Expanded fake-approval regex — cover ทุกรูปแบบ per user trace 14/07/2569.
const FAKE_APPROVAL_RE =
  /(?:ได้(?:เลย|แน่นอน)(?:ค่ะ|ครับ)|(?:ใช้|ยืนยัน)ได้(?:เลย)?(?:ค่ะ|ครับ)|เมนู(?:เดิม|นี้)?(?:ยัง)?ใช้ได้(?:เลย)?(?:ค่ะ|ครับ)?|รายการเดิม(?:ยัง)?ใช้ได้|ยืนยัน(?:ให้)?(?:เรียบร้อย)?แล้ว|เปลี่ยน(?:ให้)?(?:เรียบร้อย)?แล้ว|จัดให้ได้(?:เลย)?(?:ค่ะ|ครับ)|เปลี่ยนให้ได้(?:เลย)?(?:ค่ะ|ครับ)|(?:รายการ|เมนู|วัน|สถานที่|คิว|จำนวน|ยอด)[^\n]{0,20}?เรียบร้อยแล้ว|จอง(?:ให้)?(?:แล้ว|เรียบร้อย)|คิวได้(?:แน่นอน|เลย)|ดำเนินการ(?:ให้)?แล้ว|อนุมัติ(?:ให้)?แล้ว|สามารถ(?:เปลี่ยน|จอง|ยืนยัน|เพิ่ม|ลด|ใช้)ได้(?:เลย)?(?:ค่ะ|ครับ))/;

// Approval/change/confirmation intent from customer (opens fake-approval detection gate).
const APPROVAL_INTENT_RE =
  /(?:ได้ไหม|ได้มั้ย|ใช้ได้(?:ไหม|มั้ย)|เปลี่ยน(?:ได้)?(?:ไหม|มั้ย)|ยังใช้ได้|ตามเดิม(?:ได้)?(?:ไหม|มั้ย)|เอาเดิม|เอาตามเดิม|โอเค(?:ไหม|มั้ย)|แบบนี้(?:ได้|โอเค)|ยืนยัน|อนุมัติ|จอง(?:ให้|ได้)?|เพิ่ม|ลด|สลับ|แทน)/;

// Fake-completion phrases that indicate false server action regardless of customer intent.
const FAKE_COMPLETION_RE = /เรียบร้อยแล้ว|ยืนยันให้แล้ว|เปลี่ยนให้แล้ว|จอง(?:ให้)?แล้ว|อนุมัติให้แล้ว|ดำเนินการให้แล้ว/;

// Lead-field reask — bot ถาม lead fields
const LEAD_REASK_RE =
  /(?:ขอ|รบกวน|แจ้ง|บอก|ระบุ|ทราบ|สอบถาม)[^\n]{0,15}?(?:วัน(?:ที่)?(?:จัด)?งาน|วันงาน|จำนวน(?:แขก|คน|ผู้ร่วมงาน|ท่าน)|กี่(?:ท่าน|คน)|สถานที่(?:จัดงาน)?|จัด(?:ที่ไหน|ที่)|ประเภท(?:งาน)?|เป็นงาน(?:อะไร|ประเภทไหน)|เบอร์(?:โทร(?:ศัพท์)?|ติดต่อ)?)/;

// Callback/phone-request phrases that must be stripped from focused schedule replies.
const CALLBACK_REASK_RE =
  /(?:ขอ|รบกวน|ฝาก)[^\n]{0,10}?(?:เบอร์(?:โทร|ติดต่อ)?|โทร(?:กลับ|ติดต่อ))|เจ้าหน้าที่[^\n]{0,15}?(?:โทร(?:กลับ|ติดต่อ)|ติดต่อกลับ)|เพื่อ(?:ให้)?ติดต่อกลับ/;

// Availability inquiry intent
const AVAILABILITY_INTENT_RE =
  /(?:ว่าง(?:ไหม|มั้ย|หรือ(?:ไม่|ยัง|เปล่า))|เช็ก(?:คิว|วัน)|(?:คิว|วัน)(?:วันที่|ที่)?\d{0,2}[^\n]{0,10}(?:ว่าง|จอง))/;

function splitIntoSegments(bubble: string): string[] {
  const lines = bubble.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const segs: string[] = [];
  for (const line of lines) {
    const parts = line.split(/(?<=(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ))\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) segs.push(...parts);
    else segs.push(line);
  }
  return segs;
}

export type ExistingCycleEnforceAction = "keep" | "strip_reask" | "replace_handoff";

export interface ExistingCycleEnforceInput {
  rawAnswer: string;
  existingCycleMode: boolean;
  explicitNewCycle: boolean;
  messageText: string | null | undefined;
}

export interface ExistingCycleEnforceResult {
  /** "keep" = ปล่อย, "strip_reask" = ลบเฉพาะ reask, "replace_handoff" = แทนทั้งบับเบิล + handoff */
  action: ExistingCycleEnforceAction;
  finalAnswer: string;
  replyIntent: ExistingCycleReplyIntent | null;
  reasons: string[];
  /** Whether caller should flip customers.ai_active=false. */
  disableAi: boolean;
  /** Whether caller must clear imageTitles / skip media pipeline entirely. */
  suppressMedia: boolean;
  /** Short handoff reason string for log/badge. null when action=keep or strip_reask. */
  handoffReason: string | null;
}

export function enforceExistingCyclePolicy(
  input: ExistingCycleEnforceInput,
): ExistingCycleEnforceResult {
  const raw = String(input.rawAnswer ?? "");
  const reasons: string[] = [];
  const msg = String(input.messageText ?? "");

  const keepResult = (finalAnswer: string, extraReasons: string[]): ExistingCycleEnforceResult => ({
    action: "keep",
    finalAnswer,
    replyIntent: null,
    reasons: extraReasons,
    disableAi: false,
    suppressMedia: false,
    handoffReason: null,
  });

  if (!input.existingCycleMode || input.explicitNewCycle || !raw.trim()) {
    return keepResult(raw, ["mode_off_or_new_cycle_or_empty"]);
  }

  const replyIntent = pickExistingCycleReplyIntent(msg);
  const handoff = EXISTING_CYCLE_REPLIES[replyIntent];

  // Approval-intent gate: only treat "ambiguous approval" as fake when customer asked
  // an approval/change/confirmation question. Fake-completion phrases ("เรียบร้อยแล้ว")
  // always trip regardless of customer intent (they claim an action was taken).
  const customerAskedApproval = APPROVAL_INTENT_RE.test(msg);

  const bubbles = raw.split(/\n*---+\n*/).map((b) => b.trim()).filter(Boolean);
  const outBubbles: string[] = [];
  let anyStrip = false;
  let anyReplace = false;

  const availabilityAsk = AVAILABILITY_INTENT_RE.test(msg);

  for (const bubble of bubbles) {
    // Fake-completion is unconditional
    if (FAKE_COMPLETION_RE.test(bubble)) {
      outBubbles.push(handoff);
      anyReplace = true;
      reasons.push("fake_completion");
      continue;
    }
    // Fake-approval requires customer approval intent
    if (FAKE_APPROVAL_RE.test(bubble) && customerAskedApproval) {
      outBubbles.push(handoff);
      anyReplace = true;
      reasons.push("fake_approval_gated");
      continue;
    }

    // Focused availability: strip callback/lead reask ต่อท้าย ถ้าลูกค้าถามคิวว่าง
    if (availabilityAsk && (CALLBACK_REASK_RE.test(bubble) || LEAD_REASK_RE.test(bubble))) {
      const segs = splitIntoSegments(bubble);
      const kept = segs.filter(
        (s) => !CALLBACK_REASK_RE.test(s) && !LEAD_REASK_RE.test(s),
      );
      const clean = kept.join(" ").trim();
      const crisp =
        kept.length >= 1 && kept.length < segs.length && /(ค่ะ|คะ|ครับ|คับ)/.test(clean);
      if (crisp && !FAKE_APPROVAL_RE.test(clean) && !FAKE_COMPLETION_RE.test(clean)) {
        outBubbles.push(clean);
        anyStrip = true;
        reasons.push("availability_reask_stripped");
        continue;
      }
      outBubbles.push(EXISTING_CYCLE_REPLIES.schedule);
      anyReplace = true;
      reasons.push("availability_reask_unsplittable");
      continue;
    }

    if (LEAD_REASK_RE.test(bubble)) {
      const segs = splitIntoSegments(bubble);
      const kept = segs.filter((s) => !LEAD_REASK_RE.test(s));
      const dropped = segs.length - kept.length;
      const clean = kept.join(" ").trim();

      const crispSplit =
        dropped >= 1 &&
        kept.length >= 1 &&
        /(ค่ะ|คะ|ครับ|คับ)/.test(clean);

      if (!crispSplit) {
        outBubbles.push(handoff);
        anyReplace = true;
        reasons.push("lead_reask_unsplittable");
        continue;
      }
      if (FAKE_APPROVAL_RE.test(clean) || FAKE_COMPLETION_RE.test(clean)) {
        outBubbles.push(handoff);
        anyReplace = true;
        reasons.push("lead_reask_leaves_fake_approval");
        continue;
      }
      outBubbles.push(clean);
      anyStrip = true;
      reasons.push("lead_reask_stripped");
      continue;
    }
    outBubbles.push(bubble);
  }

  const finalAnswer = outBubbles.join("\n---\n");

  if (anyReplace) {
    return {
      action: "replace_handoff",
      finalAnswer,
      replyIntent,
      reasons,
      disableAi: true,
      suppressMedia: true,
      handoffReason: reasons[0] ?? "unspecified",
    };
  }
  if (anyStrip) {
    return {
      action: "strip_reask",
      finalAnswer,
      replyIntent,
      reasons,
      disableAi: false,
      suppressMedia: false,
      handoffReason: null,
    };
  }
  return keepResult(raw, reasons.length ? reasons : ["no_violation"]);
}
