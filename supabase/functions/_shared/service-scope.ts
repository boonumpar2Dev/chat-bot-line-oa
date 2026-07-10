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
      "",
      "🧭 Stage: **pre-quote** (ยังอยู่ขั้นดูแพ็ก/ราคา/รายละเอียด — ยังไม่ถึงขั้นเลือกเมนูเพื่อทำใบเสนอราคา)",
      "",
      "🛑 [NO_EVENT_TYPE_REASK] ถือว่า event context ชัดแล้ว — **ลูกค้าจัดงาน/พิธีเอง แล้วสั่งเฉพาะอาหารจากเรา**",
      "- ห้ามถามซ้ำว่า \"จัดงานประเภทไหน\" / \"เป็นงานอะไร\" / \"งานประเภทใด\" / \"งานแบบไหน\"",
      "- ห้ามถามว่า \"ต้องการจัดพิธีสงฆ์ไหม\" / \"ให้เราจัดพิธีไหม\" / \"อยากให้จัดพิธีด้วยไหม\" / \"ต้องการพิธีสงฆ์ด้วยไหม\"",
      "- ถ้าลูกค้าบอกงาน (เช่น ทำบุญ / ทำบุญบ้าน / ขึ้นบ้านใหม่ / งานบุญเลี้ยงพระ) พร้อมกับสั่งอาหารอย่างเดียว → รับทราบและเดินหน้าเสนอแพ็กอาหารต่อ ไม่ต้องยืนยันประเภทงานซ้ำ",
      "- ถามเฉพาะข้อมูลที่จำเป็นและยังขาดจริง เช่น จำนวนท่าน / วันจัดงาน / สถานที่ (ทีละเรื่อง จังหวะเหมาะสม)",
      "",
      "🎯 พฤติกรรมหลัก (proactive เหมือน flow เสนอแพ็กงานบุญ):",
      "- ถ้าลูกค้าถามเรื่อง แพ็กเกจ / ราคา / รายละเอียด / \"มีแบบไหนบ้าง\" / อาหารอย่างเดียว / จัดเลี้ยงนอกสถานที่ → **เสนอแพ็ก food-only ที่มีอยู่ใน context ด้านล่างทันที** ไม่ต้องรอถามวันงาน/จำนวนแขก/สถานที่ก่อน",
      "- ถ้า context มี food-only package พร้อมรูป → ระบุ imageTitles **เฉพาะรูปแพ็ก** ที่ prefix `แพ็กเกจ: <ชื่อแพ็ก>` เช่น `[\"แพ็กเกจ: งานอาหารเท่านั้น\"]` เท่านั้น",
      "- **ห้ามยัด imageTitles ของรูป KB เมนู / รายการอาหาร / รูปตัวอย่างจาน เพิ่มเอง** เมื่อลูกค้าถามแค่แพ็ก/ราคา — ส่งเฉพาะรูปแพ็ก",
      "- ตอบพร้อมรายละเอียด/ราคาเท่าที่มีใน context — **ห้ามแต่งราคาเอง** ถ้าราคาไม่มีใน context ให้พูดว่า \"ส่วนราคา/ค่าขนส่ง เดี๋ยวทีมงานช่วยเช็กตามจำนวนท่านและพื้นที่ให้อีกครั้งนะคะ\" **แต่ยังต้องเสนอรายละเอียดแพ็กที่มีให้ก่อน** ห้าม handoff ทั้งคำตอบ",
      "- ถ้า context มี food-only package เพียง 1 อัน → **ห้ามถาม \"ชอบแบบไหน\" / \"สนใจแบบไหน\" / \"อยากเลือกแบบไหน\"** เสนอแพ็กนั้นไปเลย",
      "- Handoff เฉพาะกรณีลูกค้าถามสิ่งที่ **ไม่มีใน context จริงๆ** (เช่น ส่วนลด custom, ราคาพิเศษเฉพาะพื้นที่, รายละเอียดที่ KB/package ไม่มี) ห้าม handoff ถ้าข้อมูลอยู่ใน context แล้ว",
      "",
      "🚫 ห้ามชวนลูกค้าเลือกเมนูใน pre-quote stage — ห้ามใช้ถ้อยคำ/ทำนองนี้เด็ดขาด:",
      "- \"ลองเลือกเมนู\" / \"เลือกเมนู\" / \"เลือกจากรูป\" / \"เลือกจากภาพ\"",
      "- \"จะเอาแบบไหน\" / \"เลือกแบบไหน\" / \"สนใจเมนูไหน\" / \"ชอบเมนูไหน\"",
      "- \"เลือกมาได้เลย\" / \"แจ้งเมนูที่ต้องการได้เลย\" / \"บอกเมนูที่ชอบมาได้\"",
      "เหตุผล: ลูกค้ายังอยู่ขั้นดูแพ็ก/ราคา ยังไม่เริ่มทำใบเสนอราคา — การเลือกเมนูเป็น step หลังจากเริ่มทำใบ ไม่ใช่ตอนนี้",
      "",
      "🍽️ ถ้าลูกค้า**ถามเมนูโดยตรง** (เช่น \"มีเมนูอะไรบ้าง\" / \"ขอดูเมนู\" / \"รายการอาหารมีอะไรบ้าง\" / \"อาหารไทยมีเมนูอะไร\"):",
      "- อนุญาตให้อ้าง/ส่งรายการเมนูจาก context ได้ (imageTitles เมนู KB ที่มีจริงเท่านั้น)",
      "- แต่**ห้ามเร่งให้ลูกค้าเลือกเมนูเพื่อคอนเฟิร์มทันที** — ใช้ wording ทำนอง: \"ดูรายการเมนูเบื้องต้นได้ค่ะ เดี๋ยวทีมงานช่วยแนะนำเมนูให้เหมาะกับจำนวนท่านและรูปแบบงานอีกครั้งนะคะ\"",
      "",
      "🚫 Guards (คงเดิม):",
      "- ห้ามเสนอ/พูดถึงแพ็ก \"งานบุญครบชุด\" / \"ครบวงจร\" / \"บุญ+อาหาร\" / \"บุญ+โต๊ะจีน\"",
      "- ห้ามพูดเสมือนว่าเราจัดพิธีสงฆ์/นิมนต์พระให้ — ลูกค้าจัดพิธีเอง",
      "- ห้ามส่ง \"กำหนดการพิธี\" / timeline พิธีสงฆ์",
      "- ห้าม default พระ 9 รูป หรือระบุจำนวนพระใดๆ ที่ลูกค้าไม่ได้บอก",
      "- ถ้าลูกค้าพูดว่า \"มีพระ N รูป\" / \"รวมพระ\" → หมายถึง**จำนวนแขก(พระ)ที่ลูกค้านิมนต์เอง** บวกเข้า guest_count เฉยๆ ไม่ใช่ order พิธีสงฆ์จากเรา",
      "- ห้ามใช้ package/ราคา/รูปที่เป็น \"งานบุญครบชุด\" แทน food-only",
      "- ห้าม flip scope กลับเอง — เฉพาะลูกค้าประกาศชัดว่าอยากให้เราจัดพิธีสงฆ์/ครบชุดด้วย ถึงจะเปลี่ยนได้",
      "- Allowed follow-up (ถามได้หลังเสนอแพ็ก): วันจัดงาน / จำนวนแขก / สถานที่",
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

// ─── Patch 2.2 — scope-filtered retrieval ─────────────────────────────────────
// ทำงานเฉพาะเมื่อ scope = food_only_buffet เพื่อไม่ให้ AI เห็นแพ็ก/KB งานบุญครบชุด
// - ไม่ fallback กลับไป full list เมื่อกรองแล้วเหลือ 0 (จงใจ ให้ AI handoff แทนที่จะเดา)
// - ห้ามใช้คำว่า "บุฟเฟ่ต์" เป็น deny (food-only ก็บุฟเฟ่ต์ได้)
// - KB filter deny ตาม category ก่อน เพราะ content อาจมีคำว่า "งานบุญ" แม้ตัวบทความจะเป็น food-only

const FOOD_ONLY_PKG_ALLOW: string[] = [
  "อาหารเท่านั้น",
  "อาหารอย่างเดียว",
  "เฉพาะอาหาร",
  "งานอาหาร",
  "บุฟเฟ่ต์อาหาร",
  "บุฟเฟต์อาหาร",
  "จัดเลี้ยงนอกสถานที่",
  "จัดเลี้ยง",
  "อาหารบุฟเฟ่ต์",
  "อาหารบุฟเฟต์",
  "แพ็กเกจอาหาร",
];

const FOOD_ONLY_PKG_DENY: string[] = [
  "บุญ",
  "พิธี",
  "ครบวงจร",
  "ครบชุด",
  "พิธีสงฆ์",
  "โต๊ะจีน",
  "บวงสรวง",
  "อาสนะ",
  "โต๊ะหมู่",
  "พระพุทธ",
  "ธูปเทียน",
];

const FOOD_ONLY_KB_DENY_CATEGORIES: string[] = [
  "รายละเอียดพิธีสงฆ์",
  "อุปกรณ์เสริมงานบุญ",
  "ข้อมูลเกี่ยวกับงานบุญอื่นๆ",
  "กำหนดการพิธี",
  "แพ็กเกจงานบุญครบวงจร",
];

function anyMatch(haystack: string, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

/**
 * Filter packages by service_scope.
 *   - scope != food_only_buffet → passthrough (return original list)
 *   - scope == food_only_buffet →
 *       keep pkg iff its (name + category + description) matches an ALLOW keyword
 *       AND does not match a DENY keyword.
 *       Package that neither allow-matches nor deny-matches → drop (avoid ceremony bleed).
 *   - Empty result → return [] (NO fallback). Caller should log.
 */
export function filterPackagesByScope<T extends { name?: string | null; category?: string | null; description?: string | null }>(
  pkgs: T[] | null | undefined,
  scope: ServiceScope,
): T[] {
  const list = Array.isArray(pkgs) ? pkgs : [];
  if (scope !== "food_only_buffet") return list;
  return list.filter((p) => {
    const blob = `${p?.name || ""} ${p?.category || ""} ${p?.description || ""}`;
    const isAllow = anyMatch(blob, FOOD_ONLY_PKG_ALLOW);
    const isDeny = anyMatch(blob, FOOD_ONLY_PKG_DENY);
    if (isAllow && !isDeny) return true;
    return false;
  });
}

/**
 * Filter KB items by service_scope.
 *   - scope != food_only_buffet → passthrough
 *   - scope == food_only_buffet → deny by explicit ceremony categories only.
 *     Items without category (null/empty) → keep (company info, style guide, etc.)
 */
export function filterKbByScope<T extends { category?: string | null }>(
  kbItems: T[] | null | undefined,
  scope: ServiceScope,
): T[] {
  const list = Array.isArray(kbItems) ? kbItems : [];
  if (scope !== "food_only_buffet") return list;
  return list.filter((k) => {
    const cat = (k?.category || "").trim();
    if (!cat) return true;
    return !FOOD_ONLY_KB_DENY_CATEGORIES.some((deny) => cat === deny || cat.includes(deny));
  });
}

