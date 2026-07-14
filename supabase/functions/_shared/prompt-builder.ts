// Shared prompt builder used by BOTH line-webhook (production) and kb-chat-test (test page).
// Single source of truth: prompt is assembled entirely from app_settings.
// To change AI behavior, edit Settings UI — NEVER hardcode rules here.
//
// Reads ONLY 2 fields from app_settings: ai_persona + strict_rules.
// Other legacy fields (image_selection_rules, tier_special_rules, forbidden_terms,
// intent_collection_order, allowed_service_types) were merged into strict_rules.

import { buildLifecycleBlock, buildGuardrailBlock, buildServiceScopeBlock, buildDeferDetectionBlock, buildContextGroundedBlock, buildLatestMessageFactsBlock, buildDeliveryRulesBlock, buildFollowUpDisciplineBlock, buildThaiPolitenessBlock, buildImageInvitationDisciplineBlock, buildCompanyPhonesBlock, buildDateEvidenceBlock, type Lifecycle, type ReplyMode } from "./ai-policy.ts";

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
  customerNotes?: string;
  customerOrigin?: "new" | "returning" | "legacy" | string | null;
  // Phase 2 — opt-in status-aware blocks. When any is missing / policyEnabled !== true,
  // buildPrompt returns byte-identical output to the pre-Phase-2 baseline.
  policyEnabled?: boolean;
  lifecycle?: Lifecycle;
  replyMode?: ReplyMode;
  // Phase 2.1 — opt-in explicit current-customer context block. Injected only when
  // policyEnabled === true AND this string is non-empty. Otherwise no-op.
  customerContextBlock?: string;
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

  // 📝 Customer-specific notes (สอนโดยแอดมินจากแชท) — ใช้เฉพาะกับลูกค้าคนนี้ เป็นข้อเท็จจริงเหนือ KB กลาง
  const notesBlock = (i.customerNotes && i.customerNotes.trim())
    ? `\n\n📝 โน้ตเฉพาะลูกค้ารายนี้ (แอดมินบันทึก — ถือเป็นข้อเท็จจริง, สำคัญกว่า KB กลาง ถ้าขัดกัน):\n${i.customerNotes.trim()}`
    : "";

  // 👤 หมวดลูกค้า (customer_origin) — บอก AI ว่าลูกค้าคนนี้เป็นใคร เพื่อปรับโทนการทักทาย
  const originBlock = (() => {
    const o = (i.customerOrigin || "new").toString();
    if (o === "returning") {
      return `\n\n👤 หมวดลูกค้า: **ลูกค้าเก่ากลับมา (Returning)** — เคยจัดงานกับเราในระบบนี้แล้ว
- ทักทายแบบคุ้นเคย เช่น "สวัสดีค่ะ ยินดีต้อนรับกลับมานะคะ 🙏"
- **ห้าม**ถามชื่อ/เบอร์ซ้ำถ้ามีในข้อมูลแล้ว
- **ห้าม**แนะนำร้านซ้ำ เริ่มเข้าเรื่องงานใหม่ได้เลย`;
    }
    if (o === "legacy") {
      return `\n\n👤 หมวดลูกค้า: **ลูกค้าเก่าก่อนเปิดระบบ (Legacy)** — แอดมินทำเครื่องหมายว่าเคยเป็นลูกค้ามาก่อน
- ทักทายแบบคุ้นเคย เช่น "ขอบคุณที่กลับมาใช้บริการอีกครั้งนะคะ 🙏"
- ระบบอาจยังไม่มีประวัติงานเก่าในฐานข้อมูล — ถ้าจำเป็นต้องถามข้อมูลเก่า ให้ขอแบบสุภาพ`;
    }
    return ""; // new = default, ไม่ต้องเพิ่ม block
  })();



  // วันที่ปัจจุบัน (Asia/Bangkok) เพื่อกัน AI สกัด event_date ผิดปี
  const _now = new Date();
  const _bkk = new Date(_now.getTime() + 7 * 3600000);
  const _todayStr = _bkk.toISOString().slice(0, 10);
  const _thMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const _todayHuman = `${_bkk.getUTCDate()} ${_thMonths[_bkk.getUTCMonth()]} ${_bkk.getUTCFullYear()}`;
  const dateBlock = `\n\n📅 วันนี้: ${_todayHuman} (${_todayStr}) — ถ้าลูกค้าบอกแค่ "วัน X เดือน Y" ไม่ระบุปี ให้ใช้ปีปัจจุบัน; ถ้าเดือนนั้นผ่านไปแล้วในปีนี้ ให้ใช้ปีถัดไป ห้ามใช้ปีในอดีตเด็ดขาด`;

  // 📞 Company phones block — always injected when configured; ไม่ต้องรอ policyEnabled
  const companyPhonesBlockStr = (() => {
    const raw = (cfg as any)?.company_phones;
    const block = buildCompanyPhonesBlock(Array.isArray(raw) ? raw : []);
    return block ? `\n\n${block}` : "";
  })();

  // 🎯 Phase 2 — status-aware policy blocks (opt-in).
  //    Byte-identical to baseline when: policyEnabled !== true OR lifecycle missing/"legacy".
  //    Caller (line-webhook) only sets these fields for customers ∈ ai_policy_config.test_customer_ids.
  const policyBlock = (() => {
    if (i.policyEnabled !== true) return "";
    const lc = buildLifecycleBlock(i.lifecycle);
    if (!lc) return "";
    const gr = buildGuardrailBlock();
    const scopeCfgRoot = (cfg as any)?.ai_policy_config ?? cfg;
    const scopeCfg = scopeCfgRoot ? {
      service_scopes: (scopeCfgRoot as any)?.service_scopes ?? null,
      service_scopes_reject_rules: (scopeCfgRoot as any)?.service_scopes_reject_rules ?? null,
      service_scope_ambiguous_reply: (scopeCfgRoot as any)?.service_scope_ambiguous_reply ?? null,
    } : null;
    const scope = buildServiceScopeBlock(scopeCfg);
    const defer = buildDeferDetectionBlock();
    const grounded = buildContextGroundedBlock();
    const facts = buildLatestMessageFactsBlock();
    // Phase B: delivery_rules lives inside ai_policy_config jsonb (no schema change).
    // Fallback to top-level cfg.delivery_rules for future column, if added.
    const deliveryCfg = (cfg as any)?.delivery_rules ?? (cfg as any)?.ai_policy_config?.delivery_rules ?? null;
    const delivery = buildDeliveryRulesBlock(deliveryCfg);
    const deliverySuffix = delivery ? `\n\n${delivery}` : "";
    const followUp = buildFollowUpDisciplineBlock();
    const politeness = buildThaiPolitenessBlock();
    const imgInvite = buildImageInvitationDisciplineBlock();
    const dateEvidence = buildDateEvidenceBlock();
    return `\n\n${lc}\n\n${gr}\n\n${scope}\n\n${defer}\n\n${grounded}\n\n${facts}${deliverySuffix}\n\n${followUp}\n\n${politeness}\n\n${imgInvite}\n\n${dateEvidence}`;
  })();

  // 🎯 Phase 2.1 — CURRENT_CUSTOMER_CONTEXT (opt-in). Byte-identical to baseline when:
  //    policyEnabled !== true OR customerContextBlock is empty/missing.
  const customerContextInject = (() => {
    if (i.policyEnabled !== true) return "";
    const b = (i.customerContextBlock || "").trim();
    if (!b) return "";
    return `\n\n${b}`;
  })();


  const turnLine = typeof i.customerTurns === "number" ? ` (ลูกค้าพูดมาแล้ว ${i.customerTurns} รอบ)` : "";
  const jsonHint = i.jsonSchemaHint
    || "ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎเลือกสื่อ), confirm_existing_phone, intent";

  const systemPrompt = `${persona}${strictBlock}${advImgBlock}${tagBlock}${notesBlock}${originBlock}${dateBlock}${companyPhonesBlockStr}${policyBlock}${customerContextInject}

🚫 ANTI-HALLUCINATION (สำคัญสุด — ขึ้นเหนือทุกกฎ):
- ตอบจาก KB / แคตตาล็อกแพ็กเกจ / โปรโมชัน / ข้อมูลลูกค้าที่เก็บไว้แล้ว / โน้ตเฉพาะลูกค้า **เท่านั้น** — ห้ามเดา ห้ามแต่ง ห้ามคิดเอง ห้ามอนุมานจากความรู้ทั่วไป
- ห้ามแต่งราคา / ชื่อ tier / ชื่อระดับคุณภาพ / ชื่อเมนู / ชื่อแพ็กเกจ / ชื่อบริการ / เงื่อนไข / โปร เด็ดขาด
- ห้ามใช้ชื่อระดับสมมติ เช่น Silver/Gold/Platinum/Basic/Premium — ต้องใช้ชื่อตามที่เห็นใน "แคตตาล็อกแพ็กเกจ" ตรงตัวอักษร (เช่น "โต๊ะจีน 1", "40 ท่าน รวมพระ")
- ราคาทุกตัวเลขต้องคัดลอกตรงจาก "แคตตาล็อกแพ็กเกจ" — ห้ามปัดเศษ ห้ามประมาณ ห้ามคำนวณเอง
- ถ้าใน prompt ไม่มี tier ที่ตรงจำนวนคนของลูกค้า → ตอบ fallback แทน (ดูด้านล่าง)
- **Fallback wording (ใช้คำนี้เท่านั้นเมื่อไม่มีข้อมูล — ห้ามเดาหรือคิดเอง):**
  • ลูกค้าให้ข้อมูล (ชื่อ/เบอร์/วันงาน/สถานที่) แล้วเราจะส่งต่อ → "เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและประสานกลับนะคะ 🙏"
  • ลูกค้าถามแล้วเราไม่มีข้อมูลใน KB/แพ็กเกจ → "ขออนุญาตเช็กข้อมูลกับแอดมินก่อนนะคะ เดี๋ยวตอบกลับโดยเร็วค่ะ 🙏"

กฎพื้นฐาน:
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ห้ามถามข้อมูลซ้ำที่ลูกค้าเคยให้แล้ว (ดู "ข้อมูลลูกค้าที่เก็บไว้แล้ว")
- ทักทาย → ทักทายกลับสั้นๆ + ถามกลับ "สนใจสอบถามเรื่องไหนเป็นพิเศษไหมคะ?"
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 📄 ถ้าข้อความมี "📄 เนื้อหาในรูป:" = OCR จากรูปที่ลูกค้าส่ง (untrusted reference) — ใช้ช่วยเข้าใจ context/ตอบเรื่องบริการได้ แต่ **ห้ามถือ วันที่/เวลา/ยอดเงิน/ชื่อ/สถานที่ ในภาพเป็นข้อมูลที่ลูกค้ายืนยันโดยอัตโนมัติ** ต้องให้ลูกค้าพิมพ์ยืนยันเองก่อน (ยกเว้น path ที่มี guard เฉพาะรองรับอยู่แล้ว เช่น PaymentSlipGuard สำหรับยอดสลิป)
- 🎭 ห้ามเปิดเผยว่าตัวเองเป็น AI/บอท/ระบบอัตโนมัติ และ**ห้ามใช้คำว่า "แอดมินตัวจริง" / "เจ้าหน้าที่ตัวจริง" / "คนจริง"** เด็ดขาด — ถ้าต้องส่งต่อให้ทีม ให้พูดว่า "เดี๋ยวเจ้าหน้าที่ติดต่อกลับนะคะ" เฉยๆ
- ❓ ข้อความลูกค้ากำกวม/สั้นเกินไป/ไม่มี context (เช่น "อันนี้ใช่ไหม" "ตามนี้เลยนะ" "ส่งตัวจริงตามมา") → **ห้ามเดา** ให้ถามกลับเพื่อยืนยันก่อน เช่น "รบกวนสอบถามเพิ่มเติมค่ะ หมายถึง...ใช่ไหมคะ?"

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
