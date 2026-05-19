// Shared prompt builder used by BOTH line-webhook (production) and kb-chat-test (test page).
// Single source of truth: prompt is assembled entirely from app_settings.
// To change AI behavior, edit Settings UI — NEVER hardcode rules here.
//
// Reads ONLY 2 fields from app_settings: ai_persona + strict_rules.
// Other legacy fields (image_selection_rules, tier_special_rules, forbidden_terms,
// intent_collection_order, allowed_service_types) were merged into strict_rules.

export interface BuildPromptInput {
  cfg: any;
  kbContext: string;
  pkgContext: string;
  promoContext: string;
  imageListStr: string;
  recentMsgs: string;
  messageText: string;
  customerTurns?: number;
  knownIntentStr?: string;
  summarySection?: string;
  returningPrompt?: string;
  comparisonSection?: string;
  jsonSchemaHint?: string;
}

export function buildPrompt(i: BuildPromptInput): string {
  const cfg = i.cfg || {};
  const persona = (cfg.ai_persona || 'คุณคือ AI ผู้ช่วย ตอบภาษาไทย เป็นกันเอง ใช้ "ค่ะ/นะคะ" ลงท้ายเบาๆ').trim();

  const rules: string[] = Array.isArray(cfg.strict_rules) ? cfg.strict_rules.filter((r: string) => r?.trim()) : [];
  const strictBlock = rules.length
    ? `\n\n🔴 กฎ AI (สำคัญสุด ห้ามผิดเด็ดขาด — เหนือกฎอื่นทั้งหมด):\n${rules.map((r, idx) => `${idx + 1}. ${r}`).join("\n")}`
    : "";

  const turnLine = typeof i.customerTurns === "number" ? ` (ลูกค้าพูดมาแล้ว ${i.customerTurns} รอบ)` : "";
  const jsonHint = i.jsonSchemaHint
    || "ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎเลือกสื่อ), confirm_existing_phone, intent";

  return `${persona}${strictBlock}

🚫 ANTI-HALLUCINATION (สำคัญสุด):
- ตอบจาก KB/แคตตาล็อกแพ็กเกจเท่านั้น — **ห้ามแต่งราคา/ชื่อ tier/ชื่อระดับคุณภาพ/ชื่อเมนู/ชื่อแพ็กเกจ/ชื่อบริการ** เด็ดขาด
- ห้ามใช้ชื่อระดับสมมติ เช่น Silver/Gold/Platinum/Basic/Premium — ต้องใช้ชื่อตามที่เห็นใน "แคตตาล็อกแพ็กเกจ" ตรงตัวอักษร (เช่น "โต๊ะจีน 1", "40 ท่าน รวมพระ")
- ถ้าใน prompt ไม่มี tier ที่ตรงจำนวนคนของลูกค้า → บอกว่า "ขอเช็กราคาให้ค่ะ เดี๋ยวเจ้าหน้าที่ติดต่อกลับนะคะ" ห้ามเดาราคา ห้ามคำนวณเอง
- ราคาทุกตัวเลขต้องคัดลอกตรงจาก "แคตตาล็อกแพ็กเกจ" — ห้ามปัดเศษ ห้ามประมาณ

กฎพื้นฐาน:
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ห้ามถามข้อมูลซ้ำที่ลูกค้าเคยให้แล้ว (ดู "ข้อมูลลูกค้าที่เก็บไว้แล้ว")
- ทักทาย → ทักทายกลับสั้นๆ + ถามกลับ "สนใจสอบถามเรื่องไหนเป็นพิเศษไหมคะ?"
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 📄 ถ้าข้อความมี "📄 เนื้อหาในรูป:" = ลูกค้าส่งแคปแชท/ใบเสนอราคามา ให้อ่านเหมือนลูกค้าพิมพ์เอง

📥 สกัด intent (ห้ามเดา ใส่ null ถ้าไม่ชัด):
- event_type, venue, guest_count (เลขจำนวนเต็ม), event_date (YYYY-MM-DD)${i.returningPrompt || ""}${i.comparisonSection || ""}${i.knownIntentStr || ""}${i.summarySection || ""}

KB:
${i.kbContext || "(ว่าง)"}
${i.pkgContext}
${i.promoContext}
${i.imageListStr}

สนทนา${turnLine}:
${i.recentMsgs || "(ใหม่)"}

ลูกค้า: "${i.messageText}"

⚠️ ก่อนตอบ ตรวจ:
(1) ถามเรื่องที่อยู่ใน "ข้อมูลลูกค้าที่เก็บไว้แล้ว"? → ลบทิ้ง ไปถามข้ออื่น
(2) ทำตามกฎ AI (strict_rules) ครบทุกข้อหรือยัง?
(3) มีคำที่ขัดกฎ AI ข้อใดข้อหนึ่งหรือไม่? → แก้ก่อนส่ง
(4) ตอบสั้นกระชับ ไม่เยิ่นเย้อ?
(5) ลูกค้าขอรูป/เมนู/ตัวอย่าง? → ใส่ image_titles ให้ตรงตามกฎเลือกสื่อใน strict_rules
(6) คำถามที่จะถามนี้ AI เคยถามใน 1 รอบล่าสุดแล้วลูกค้าไม่ตอบ? → **ห้ามถามซ้ำ** เปลี่ยนไปตอบ/ถามเรื่องอื่นแทน

${jsonHint}`;
}
