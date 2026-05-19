// Shared prompt builder used by BOTH line-webhook (production) and kb-chat-test (test page).
// Single source of truth: prompt is assembled entirely from app_settings.
// To change AI behavior, edit Settings UI — NEVER hardcode rules here.

export interface BuildPromptInput {
  cfg: any;                       // app_settings row
  kbContext: string;              // already-truncated KB block
  pkgContext: string;             // already-truncated package block
  promoContext: string;           // already-truncated promo block
  imageListStr: string;           // image/video catalog + image_selection_rules
  recentMsgs: string;             // formatted recent conversation
  messageText: string;            // current customer message
  customerTurns?: number;         // how many turns customer has spoken
  knownIntentStr?: string;        // "ข้อมูลลูกค้าที่เก็บไว้แล้ว"
  summarySection?: string;        // older conversation summary
  returningPrompt?: string;       // returning customer with phone
  comparisonSection?: string;     // phase-1/2 comparison strategy
  jsonSchemaHint?: string;        // override final JSON line
}

export function buildPrompt(i: BuildPromptInput): string {
  const cfg = i.cfg || {};
  const persona = (cfg.ai_persona || 'คุณคือ AI ผู้ช่วย ตอบภาษาไทย เป็นกันเอง ใช้ "ค่ะ/นะคะ" ลงท้ายเบาๆ').trim();

  // strict_rules → วางไว้ "บนสุด" หลัง persona เพื่อให้ AI ให้น้ำหนักสูงสุด
  const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
    ? cfg.strict_rules.filter((r: string) => r?.trim()).map((r: string, idx: number) => `${idx + 1}. ${r}`).join("\n")
    : "";
  const strictSection = strictRules ? `\n\n🔴 กฎเข้มงวด (สำคัญสุด ห้ามผิดเด็ดขาด — เหนือกฎอื่นทั้งหมด):\n${strictRules}` : "";

  const allowedTypes: string[] = Array.isArray(cfg.allowed_service_types) ? cfg.allowed_service_types : [];
  const forbiddenTerms: string[] = Array.isArray(cfg.forbidden_terms) ? cfg.forbidden_terms : [];
  const allowedLine = allowedTypes.length ? `\n- รูปแบบบริการที่อนุญาต = **${allowedTypes.join(", ")} เท่านั้น**` : "";
  const forbiddenLine = forbiddenTerms.length ? ` ❌ ห้ามพูด "${forbiddenTerms.join("/")}"` : "";
  const intentOrder = (cfg.intent_collection_order || "ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → ขอเบอร์โทร (ข้ามข้อที่ลูกค้าให้แล้ว)").trim();
  const tierSpecial = (cfg.tier_special_rules || "").trim();
  const tierSpecialLine = tierSpecial ? `\n${tierSpecial}\n` : "";
  const forbiddenCheckLine = forbiddenTerms.length
    ? `(5) มีคำต้องห้าม "${forbiddenTerms.join("/")}" หรืออาหาร/บริการนอก [${allowedTypes.join("/")}]? → ลบทิ้ง\n`
    : "";

  const turnLine = typeof i.customerTurns === "number" ? ` (ลูกค้าพูดมาแล้ว ${i.customerTurns} รอบ)` : "";

  const jsonHint = i.jsonSchemaHint
    || "ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎเลือกสื่อ), confirm_existing_phone, intent";

  return `${persona}${strictSection}

🚫 ANTI-HALLUCINATION:
- ตอบจาก KB เท่านั้น ห้ามแต่ง ห้ามเดา${allowedLine}${forbiddenLine}
- ห้ามแต่งชื่อเมนู/แพ็กเกจ/บริการ ไม่แน่ใจ → "ขอส่งต่อทีมงานนะคะ"

กฎหลัก:
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ห้ามถามข้อมูลซ้ำที่ลูกค้าเคยให้แล้ว (ดู "ข้อมูลลูกค้าที่เก็บไว้แล้ว")
- ถ้าลูกค้าระบุรูปแบบบริการชัดเจน (เช่น โต๊ะจีน/บุฟเฟ่ต์/ซุ้มอาหาร) → เลือกเฉพาะแพ็กเกจ category นั้นก่อน ห้ามย้อนเลือกแพ็กคนละประเภท
- 🔴 "แขก N" = แขก N คน **ไม่รวมพระ** → ต้องเลือก tier ที่ค่าใน 【รับแขกได้สูงสุด X คน】 X ≥ N เท่านั้น ห้ามใช้ตัวเลขใน tier_name ตัดสิน ห้ามถามซ้ำว่า "รวมพระหรือยัง"
- เมื่อ tier ที่รองรับมีระดับคุณภาพ Standard/Premium/Elite → เสนอครบทุกระดับพร้อมราคา ห้ามเลือกให้เอง ห้ามใช้ราคา tier รวมแทนราคา quality_levels
- ลำดับเก็บข้อมูล: ${intentOrder}
- ทักทาย → ทักทายกลับสั้นๆ + ถามกลับ "สนใจสอบถามเรื่องไหนเป็นพิเศษไหมคะ?"
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 🚫 ห้ามเสนอแพ็กเกจที่ไม่ตรงเงื่อนไขขั้นต่ำ (min_condition)
- 📸 ทุกครั้งที่แนะนำแพ็กเกจ ใส่ "แพ็กเกจ: <ชื่อ>" ลง image_titles
- ⚠️ รูป tier (มี " — "): ส่งเฉพาะเมื่อ tier ตรงกับจำนวนท่านที่ลูกค้าระบุเท่านั้น
- 📄 ถ้าข้อความมี "📄 เนื้อหาในรูป:" = ลูกค้าส่งแคปแชท/ใบเสนอราคามา ให้อ่านเหมือนลูกค้าพิมพ์เอง
${tierSpecialLine}
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
(2) ทำตามกฎเข้มงวด (strict_rules) ครบทุกข้อหรือยัง?
(3) มีคำที่ขัดกฎเข้มงวดข้อใดข้อหนึ่งหรือไม่? → แก้ก่อนส่ง
(4) ตอบสั้นกระชับ ไม่เยิ่นเย้อ?
${forbiddenCheckLine}(${forbiddenCheckLine ? "6" : "5"}) ลูกค้าขอรูป/เมนู/ตัวอย่าง? → ใส่ image_titles ให้ตรงตามกฎเลือกสื่อ
(${forbiddenCheckLine ? "7" : "6"}) คำถามที่จะถามนี้ AI เคยถามใน 1 รอบล่าสุดแล้วลูกค้าไม่ตอบ? → **ห้ามถามซ้ำ** เปลี่ยนไปตอบ/ถามเรื่องอื่นแทน

${jsonHint}`;
}
