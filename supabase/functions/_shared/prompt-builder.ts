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
  tagInstructions?: string;
}

export function buildPrompt(i: BuildPromptInput): { systemPrompt: string; userPrompt: string } {
  const cfg = i.cfg || {};
  const persona = (cfg.ai_persona || 'คุณคือ AI ผู้ช่วย ตอบภาษาไทย เป็นกันเอง ใช้ "ค่ะ/นะคะ" ลงท้ายเบาๆ').trim();

  // Auto-generate pronoun rule from settings fields (ไม่ต้อง hardcode ใน strict_rules)
  const selfAllowed: string[] = Array.isArray(cfg.self_pronouns_allowed) ? cfg.self_pronouns_allowed.filter((x: string) => x?.trim()) : [];
  const custAllowed: string[] = Array.isArray(cfg.customer_pronouns_allowed) ? cfg.customer_pronouns_allowed.filter((x: string) => x?.trim()) : [];
  const forbidden: string[] = Array.isArray(cfg.forbidden_pronouns) ? cfg.forbidden_pronouns.filter((x: string) => x?.trim()) : [];
  const pronounRule = (selfAllowed.length || custAllowed.length || forbidden.length)
    ? `🗣️ กฎสรรพนาม (สำคัญ):${selfAllowed.length ? ` แทนตัวเองได้แค่ ${selfAllowed.map(x => `"${x}"`).join("/")} เท่านั้น` : ""}${custAllowed.length ? ` | เรียกลูกค้าได้แค่ ${custAllowed.map(x => `"${x}"`).join("/")} เท่านั้น (ถ้าทราบชื่อให้ใช้ "คุณ[ชื่อ]" ถ้าไม่ทราบใช้ "ลูกค้า" หรือเลี่ยงไม่ระบุสรรพนาม)` : ""}${forbidden.length ? ` | ห้ามใช้คำเหล่านี้เด็ดขาด: ${forbidden.join(", ")}` : ""}`
    : "";

  const rules: string[] = Array.isArray(cfg.strict_rules) ? cfg.strict_rules.filter((r: string) => r?.trim()) : [];
  const replyLen = Number.isFinite(+cfg.reply_length) && +cfg.reply_length > 0 ? +cfg.reply_length : 60;
  const replyBubbles = Number.isFinite(+cfg.reply_bubbles) && +cfg.reply_bubbles > 0 ? +cfg.reply_bubbles : 3;
  const styleRule = `✂️ สไตล์การตอบ: ตอบสั้น ≤${replyLen} คำต่อบับเบิล แยกบับเบิลด้วย "---" (สูงสุด ${replyBubbles} บับเบิล) — ห้ามยาวเกิน ห้ามตื๊อ`;
  const allRules = pronounRule ? [pronounRule, styleRule, ...rules] : [styleRule, ...rules];
  const strictBlock = allRules.length
    ? `\n\n🔴 กฎ AI (สำคัญสุด ห้ามผิดเด็ดขาด — เหนือกฎอื่นทั้งหมด):\n${allRules.map((r, idx) => `${idx + 1}. ${r}`).join("\n")}`
    : "";

  // กฎการส่งรูปขั้นสูง (อ่านจาก app_settings — แก้ได้ใน UI ตั้งค่า AI > กลยุทธ์รูป)
  const advImgRules = [cfg.image_rule_no_extra, cfg.image_rule_no_format, cfg.image_rule_no_repeat]
    .map((r: any) => (typeof r === "string" ? r.trim() : "")).filter(Boolean);
  const advImgBlock = advImgRules.length
    ? `\n\n🖼️ กฎการส่งรูปขั้นสูง:\n${advImgRules.map((r, i) => `- ${r}`).join("\n")}`
    : "";

  // 🏷️ คำสั่งเฉพาะตามแท็กของลูกค้ารายนี้ (จากตาราง tags.ai_tag_instructions)
  // — เป็น "แนวทาง" ไม่ใช่ strict_rules; ถ้าขัดกับ strict_rules ให้ strict_rules ชนะ
  const tagBlock = (i.tagInstructions && i.tagInstructions.trim())
    ? `\n\n🏷️ บริบทเฉพาะลูกค้ารายนี้ (จากแท็ก — เป็นแนวทาง, ถ้าขัด strict_rules ให้ strict_rules ชนะ):\n${i.tagInstructions.trim()}`
    : "";


  // วันที่ปัจจุบัน (Asia/Bangkok) เพื่อกัน AI สกัด event_date ผิดปี
  const _now = new Date();
  const _bkk = new Date(_now.getTime() + 7 * 3600000);
  const _todayStr = _bkk.toISOString().slice(0, 10);
  const _thMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const _todayHuman = `${_bkk.getUTCDate()} ${_thMonths[_bkk.getUTCMonth()]} ${_bkk.getUTCFullYear()}`;
  const dateBlock = `\n\n📅 วันนี้: ${_todayHuman} (${_todayStr}) — ถ้าลูกค้าบอกแค่ "วัน X เดือน Y" ไม่ระบุปี ให้ใช้ปีปัจจุบัน; ถ้าเดือนนั้นผ่านไปแล้วในปีนี้ ให้ใช้ปีถัดไป ห้ามใช้ปีในอดีตเด็ดขาด`;

  const turnLine = typeof i.customerTurns === "number" ? ` (ลูกค้าพูดมาแล้ว ${i.customerTurns} รอบ)` : "";
  const jsonHint = i.jsonSchemaHint
    || "ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎเลือกสื่อ), confirm_existing_phone, intent";

  const systemPrompt = `${persona}${strictBlock}${advImgBlock}${dateBlock}

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

📥 สกัด intent (ห้ามเดา ใส่ null ถ้าไม่ชัด) — **ทุก field ต้องเป็นภาษาไทยเท่านั้น ห้ามใช้ภาษาอังกฤษเด็ดขาด**:
- event_type (ไทย เช่น "ทำบุญ", "งานบวช", "งานแต่ง", "งานศพ", "ขึ้นบ้านใหม่" — ห้าม "merit-making", "wedding", "funeral"), venue (ไทย), guest_count (เลขจำนวนเต็ม), event_date (YYYY-MM-DD)

${jsonHint}`;

  const userPrompt = `${i.returningPrompt || ""}${i.comparisonSection || ""}${i.knownIntentStr || ""}${i.summarySection || ""}

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
(6) คำถามที่จะถามนี้ AI เคยถามใน 1 รอบล่าสุดแล้วลูกค้าไม่ตอบ? → **ห้ามถามซ้ำ** เปลี่ยนไปตอบ/ถามเรื่องอื่นแทน`;

  return { systemPrompt, userPrompt };
}
