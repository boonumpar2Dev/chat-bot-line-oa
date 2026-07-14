// Existing-Cycle Post-AI Enforcement
//
// รันหลัง callAI() แต่ก่อนจะส่ง reply ไป LINE — เฉพาะเมื่อ:
//   existingCycleMode === true  AND  explicitNewCycle === false
//
// เจตนา:
//   A) Fake-approval detection
//      ตัวอย่าง: "ได้เลยค่ะ", "ยืนยันให้แล้ว", "เปลี่ยนให้แล้ว", "เรียบร้อยแล้ว",
//                 "จองให้แล้ว", "คิวได้แน่นอน", "ดำเนินการให้แล้ว", "อนุมัติให้แล้ว",
//                 "สามารถเปลี่ยนได้ค่ะ" (unsupported approval)
//      → replace ทั้งบับเบิลด้วย deterministic handoff (ห้าม salvage)
//
//   B) Lead-field reask ต่อท้าย (venue/date/guest/event_type/phone)
//      → strip ได้ **เฉพาะเมื่อ segment แยกได้ชัดเจน**
//         (คั่นด้วย \n, "---", หรือประโยคจบด้วย ค่ะ/คะ/ครับ แล้วประโยคถัดไปเป็นคำถาม lead field)
//      → ถ้าแยกไม่มั่นใจ → replace ทั้งบับเบิล
//      → ถ้า strip แล้วยังมี fake-approval หลงเหลือ → replace ทั้งบับเบิล
//
// Pure function. Caller รับผิดชอบ log + ส่ง reply.

import {
  EXISTING_CYCLE_REPLIES,
  pickExistingCycleReplyIntent,
  type ExistingCycleReplyIntent,
} from "./existing-cycle-reply.ts";

// Fake approval — อ้างว่าดำเนินการให้แล้ว/ยืนยันให้แล้ว โดยไม่มี server-side evidence.
// Cover ทั้งรูปแบบเปิดประโยคและกลางประโยค.
const FAKE_APPROVAL_RE =
  /(?:ได้เลย(?:ค่ะ|ครับ)|ยืนยัน(?:ให้)?แล้ว|เปลี่ยน(?:ให้)?แล้ว|(?:รายการ|เมนู|วัน|สถานที่|คิว|จำนวน|ยอด)[^\n]{0,20}?เรียบร้อยแล้ว|จอง(?:ให้)?(?:แล้ว|เรียบร้อย)|คิวได้(?:แน่นอน|เลย)|ดำเนินการ(?:ให้)?แล้ว|อนุมัติ(?:ให้)?แล้ว|เมนูนี้ได้(?:เลย)?ค่ะ|สามารถ(?:เปลี่ยน|จอง|ยืนยัน|เพิ่ม|ลด)ได้(?:เลย)?(?:ค่ะ|ครับ))/;

// Lead-field reask — bot ถามข้อมูลพื้นฐานลูกค้า (แม้ปรากฏกลางประโยคก็ถือว่ามีการถาม)
const LEAD_REASK_RE =
  /(?:ขอ|รบกวน|แจ้ง|บอก|ระบุ|ทราบ|สอบถาม)[^\n]{0,15}?(?:วัน(?:ที่)?(?:จัด)?งาน|วันงาน|จำนวน(?:แขก|คน|ผู้ร่วมงาน|ท่าน)|กี่(?:ท่าน|คน)|สถานที่(?:จัดงาน)?|จัด(?:ที่ไหน|ที่)|ประเภท(?:งาน)?|เป็นงาน(?:อะไร|ประเภทไหน)|เบอร์(?:โทร(?:ศัพท์)?|ติดต่อ)?)/;

// Segment splitter — ประโยคจบด้วย ค่ะ/คะ/ครับ/คับ ตามด้วย whitespace/บรรทัดใหม่.
// ใช้ lookbehind แบบ safe: split บน "\n" ก่อน แล้วจึง split ในแต่ละบรรทัดด้วย pattern จบท้าย
function splitIntoSegments(bubble: string): string[] {
  const lines = bubble.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const segs: string[] = [];
  for (const line of lines) {
    // split after politeness suffix followed by space
    const parts = line.split(/(?<=(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ))\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) segs.push(...parts);
    else segs.push(line);
  }
  return segs;
}

export interface ExistingCycleEnforceInput {
  rawAnswer: string;
  existingCycleMode: boolean;
  explicitNewCycle: boolean;
  messageText: string | null | undefined;
}

export interface ExistingCycleEnforceResult {
  /** "keep" = ปล่อยผ่าน, "strip_reask" = ลบเฉพาะคำถามท้าย, "replace" = แทนทั้งบับเบิล */
  action: "keep" | "strip_reask" | "replace";
  finalAnswer: string;
  replyIntent: ExistingCycleReplyIntent | null;
  reasons: string[];
}

export function enforceExistingCyclePolicy(
  input: ExistingCycleEnforceInput,
): ExistingCycleEnforceResult {
  const raw = String(input.rawAnswer ?? "");
  const reasons: string[] = [];

  if (!input.existingCycleMode || input.explicitNewCycle || !raw.trim()) {
    return { action: "keep", finalAnswer: raw, replyIntent: null, reasons: ["mode_off_or_new_cycle_or_empty"] };
  }

  const replyIntent = pickExistingCycleReplyIntent(input.messageText);
  const handoff = EXISTING_CYCLE_REPLIES[replyIntent];

  const bubbles = raw.split(/\n*---+\n*/).map((b) => b.trim()).filter(Boolean);
  const outBubbles: string[] = [];
  let anyStrip = false;
  let anyReplace = false;

  for (const bubble of bubbles) {
    if (FAKE_APPROVAL_RE.test(bubble)) {
      outBubbles.push(handoff);
      anyReplace = true;
      reasons.push("fake_approval");
      continue;
    }
    if (LEAD_REASK_RE.test(bubble)) {
      // Try to strip: keep only segments that don't match reask
      const segs = splitIntoSegments(bubble);
      const kept = segs.filter((s) => !LEAD_REASK_RE.test(s));
      const dropped = segs.length - kept.length;
      const clean = kept.join(" ").trim();

      // Split must be crisp: at least one reask segment removed AND at least
      // one non-reask segment kept AND kept text still contains politeness
      // suffix (so we didn't chop mid-sentence).
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
      // Post-strip must not contain fake approval either
      if (FAKE_APPROVAL_RE.test(clean)) {
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
  if (anyReplace) return { action: "replace", finalAnswer, replyIntent, reasons };
  if (anyStrip) return { action: "strip_reask", finalAnswer, replyIntent, reasons };
  return { action: "keep", finalAnswer: raw, replyIntent: null, reasons: reasons.length ? reasons : ["no_violation"] };
}
