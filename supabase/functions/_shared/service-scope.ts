// Patch 2.1 — Service scope drift guard
// ─────────────────────────────────────────────────────────────────────────────
// ปัญหา: ลูกค้าบอกชัดว่า "อาหารอย่างเดียว" แต่รอบถัด AI ลากไป "งานบุญครบชุด" / พระ 9
// วิธี: detect food-only intent แบบ deterministic → persist ลง customers.intent_data.service_scope
//       ทุก turn หลังจากนั้น inject lock prompt เพื่อไม่ให้ AI infer ใหม่
//
// Scope นี้:
//   - แก้เฉพาะ food_only_buffet drift + กัน default monk_count=9 กับ food_only
//   - ไม่แตะ pricing / promotion / monk_count guard อื่น
//   - ไม่แตะ service_scope อื่นๆ (บุญครบชุด / เช่าอุปกรณ์ / ฯลฯ)

export type ServiceScope =
  | "food_only_buffet"
  | "full_merit_package"
  | null;

export type ScopeResolveResult = {
  scope: ServiceScope;
  changed: boolean;      // true = ต่างจาก current → ต้อง persist
  reason: string;        // สำหรับ log
};

// ─── Food-only detectors ─────────────────────────────────────────────────────
// จับเฉพาะรูปแบบที่ลูกค้า *ประกาศ* food-only ชัดเจน. ห้ามจับกว้างเกินไป.
// (คำว่า "อาหาร" เฉยๆ ห้ามจับ เพราะลูกค้าอาจแค่ถามเมนู)

const FOOD_ONLY_PATTERNS: RegExp[] = [
  /อาหาร\s*อย่าง\s*เดียว/,               // อาหารอย่างเดียว
  /อาหาร\s*ล้วน/,                         // อาหารล้วนๆ
  /สั่ง\s*(?:แต่|เฉพาะ|เอา\s*แค่)\s*อาหาร/,
  /(?:เอา|รับ|เอาแค่|ขอ)\s*(?:แต่|เฉพาะ)\s*อาหาร/,
  /จัด\s*(?:งาน|พิธี|เอง)\s*(?:เอง)?[^]*?(?:เอา|รับ|สั่ง|ขอ)\s*(?:แต่|เฉพาะ|แค่)?\s*อาหาร/,
  /ไม่\s*(?:เอา|รวม|ต้องการ|อยากได้)\s*(?:พิธี|สงฆ์|พระ|แพ็กเกจ|แพ็ก)/,
  /ไม่\s*ต้องการ\s*พิธี/,
  /เอา\s*เฉพาะ\s*(?:ส่วน)?อาหาร/,
];

// ─── Full-service switch detectors ───────────────────────────────────────────
// อนุญาตให้ upgrade กลับเป็นครบชุด ถ้าลูกค้า *ประกาศชัด*
const FULL_SERVICE_SWITCH_PATTERNS: RegExp[] = [
  /(?:อยาก|ขอ|เอา|รวม|เพิ่ม|จัด)\s*(?:ให้)?\s*(?:มี\s*)?พิธี\s*สงฆ์\s*(?:ด้วย|ให้)/,
  /จัด\s*(?:ให้)?\s*พิธี\s*(?:ด้วย|ให้)/,
  /(?:เอา|ขอ|จัด)\s*(?:แบบ)?\s*ครบ\s*(?:ชุด|วงจร)/,
  /แพ็กเกจ\s*(?:งาน)?\s*บุญ\s*ครบ/,
  /เปลี่ยน\s*(?:เป็น|มา)\s*(?:แบบ)?ครบ/,
];

export function detectFoodOnlyPhrase(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return FOOD_ONLY_PATTERNS.some((re) => re.test(t));
}

export function detectFullServiceSwitchPhrase(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return FULL_SERVICE_SWITCH_PATTERNS.some((re) => re.test(t));
}

/**
 * Resolve service_scope from current stored value + latest customer message.
 *
 * Sticky rules:
 *   - เมื่อ scope=food_only_buffet แล้ว → คงไว้ ยกเว้นลูกค้าประกาศ switch ชัดเจน
 *   - ถ้ายังไม่มี scope และเจอ food-only phrase → set food_only_buffet
 *   - ถ้ายังไม่มี scope และเจอ full-service switch phrase → set full_merit_package
 *   - ถ้าไม่เข้าเงื่อนไข → คงค่าเดิม (null คงเป็น null)
 */
export function resolveServiceScope(
  current: ServiceScope | string | null | undefined,
  latestMessage: string,
): ScopeResolveResult {
  const cur: ServiceScope = current === "food_only_buffet" || current === "full_merit_package"
    ? current
    : null;

  const isFoodOnly = detectFoodOnlyPhrase(latestMessage);
  const isFullSwitch = detectFullServiceSwitchPhrase(latestMessage);

  if (cur === "food_only_buffet") {
    if (isFullSwitch) {
      return { scope: "full_merit_package", changed: true, reason: "customer switched to full merit explicitly" };
    }
    return { scope: cur, changed: false, reason: "sticky food_only_buffet" };
  }

  if (cur === "full_merit_package") {
    if (isFoodOnly) {
      return { scope: "food_only_buffet", changed: true, reason: "customer narrowed to food-only" };
    }
    return { scope: cur, changed: false, reason: "sticky full_merit_package" };
  }

  // no current scope
  if (isFoodOnly) return { scope: "food_only_buffet", changed: true, reason: "first-time food-only phrase" };
  if (isFullSwitch) return { scope: "full_merit_package", changed: true, reason: "first-time full-merit phrase" };
  return { scope: null, changed: false, reason: "no scope evidence yet" };
}

/**
 * Build prompt lock block to inject when scope is already known.
 * แนบเข้า knownIntent block ก่อนส่ง AI เพื่อ:
 *   - ห้ามลากไปแพ็กงานบุญครบชุด
 *   - ห้ามพูดว่าเราจัดพิธีสงฆ์ให้ (เว้นแต่ลูกค้าถาม/ประกาศ switch)
 *   - "พระ N รูป" ที่ลูกค้าพูด = ข้อมูลจำนวนแขก ไม่ใช่ order พิธีสงฆ์จากเรา
 *   - ห้าม default monk_count=9
 *   - ถ้าไม่มั่นใจ → handoff แอดมิน
 */
export function buildServiceScopeLockPrompt(scope: ServiceScope): string {
  if (scope === "food_only_buffet") {
    return [
      "",
      "🔒 [SERVICE_SCOPE_LOCK = food_only_buffet]",
      "ลูกค้าประกาศแล้วว่าต้องการ **อาหารอย่างเดียว (บุฟเฟต์)** — บันทึกไว้ใน intent_data.service_scope",
      "กฎบังคับ (ห้ามผิดเด็ดขาด):",
      "- ห้ามเสนอ/พูดถึงแพ็กเกจ \"งานบุญครบชุด\" / \"ครบวงจร\" / \"บุญ+อาหาร\"",
      "- ห้ามพูดเสมือนว่าเราจัดพิธีสงฆ์/นิมนต์พระให้ ลูกค้าจัดพิธีเอง",
      "- ห้ามส่ง \"กำหนดการพิธี\" / timeline พิธีสงฆ์",
      "- ห้าม default พระ 9 รูป หรือระบุจำนวนพระใดๆ ที่ลูกค้าไม่ได้บอก",
      "- ถ้าลูกค้าพูดว่า \"มีพระ N รูป\" / \"รวมพระ\" → หมายถึง**จำนวนแขก(พระ)ที่ลูกค้านิมนต์เอง**ให้บวกเข้า guest_count เฉยๆ — ไม่ใช่ order พิธีสงฆ์จากเรา",
      "- ห้ามใช้ package/ราคา/รูปที่เป็น \"งานบุญครบชุด\"",
      "- ถ้าไม่มั่นใจว่าเมนู/ราคา/แพ็กไหนตรง scope → **handoff แอดมิน** อย่าเดา",
      "- ห้าม flip scope กลับเอง — เฉพาะลูกค้าประกาศชัดว่าอยากให้เราจัดพิธีสงฆ์ด้วย ถึงจะเปลี่ยนได้",
      "- Allowed follow-up: วันจัดงาน / จำนวนแขก / สถานที่ / handover ทีมงาน",
      "",
    ].join("\n");
  }
  if (scope === "full_merit_package") {
    return [
      "",
      "🔒 [SERVICE_SCOPE_LOCK = full_merit_package]",
      "ลูกค้าประกาศชัดว่าอยากได้แบบครบชุด (บุญ+อาหาร+พิธีสงฆ์) — เสนอแพ็กเกจครบชุดได้",
      "",
    ].join("\n");
  }
  return "";
}
