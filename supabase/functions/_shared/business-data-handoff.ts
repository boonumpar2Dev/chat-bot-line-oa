// Phase 3 — Structured Business Data Handoff (shared: Legacy + Phase 2).
//
// Purpose: after the model returns, decide server-side whether the reply may be
// sent as-is or MUST be replaced by a real handoff (ai_active=false + banner).
//
// This module is PURE. No DB, no network, no globals. Deterministic outputs so
// Legacy and Phase 2 behave identically under the same inputs.
//
// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE NOTE — DO NOT infer handoff from generated response wording.
// The only signals used to decide handoff are:
//   1. Structured `business_data_decision` from the model.
//   2. Server-side source ID validation (id ∈ retrieved context).
//   3. Server-side source-topic validation (source content matches the
//      category of the question — added Phase 3.1 to fix Root Cause where the
//      model cites a real KB row that is about the WRONG topic).
//   4. The server-fixed heuristic `detectBusinessQuestion(messageText)`.
// Regex / keyword scans over the model's `answer` text MUST NEVER trigger
// handoff — wording can change, causing false positives. This is enforced by
// `business-data-handoff_test.ts` (Case H).
// ─────────────────────────────────────────────────────────────────────────────

export type BusinessDataDecision =
  | "answer_from_source"
  | "handoff_missing_source"
  | "handoff_conflicting_source"
  | "not_applicable";

export type BusinessDataCategory =
  | "pricing"
  | "addon"
  | "service_fee"
  | "discount"
  | "promotion"
  | "min_order"
  | "delivery_fee"
  | "package_condition"
  | "none";

const CATEGORIES: readonly BusinessDataCategory[] = [
  "pricing",
  "addon",
  "service_fee",
  "discount",
  "promotion",
  "min_order",
  "delivery_fee",
  "package_condition",
  "none",
] as const;

const DECISIONS: readonly BusinessDataDecision[] = [
  "answer_from_source",
  "handoff_missing_source",
  "handoff_conflicting_source",
  "not_applicable",
] as const;

// Server-fixed fallback wording. NO numbers, NO promises, NO time commitments
// that we cannot guarantee. Same string for Legacy + Phase 2.
export const BUSINESS_DATA_FALLBACK_TEXT =
  "ขออนุญาตเช็กข้อมูลกับแอดมินก่อนนะคะ เดี๋ยวแอดมินตอบกลับให้ค่ะ 🙏";

// ─── Category keyword map ────────────────────────────────────────────────────
// Used to categorize BOTH the customer question and each retrieved source's
// text. A source is considered "on-topic" only if it shares at least one
// category with the question.
type CatKey = Exclude<BusinessDataCategory, "none">;
const CATEGORY_KEYWORDS: Record<CatKey, string[]> = {
  pricing: [
    "ราคา", "กี่บาท", "เท่าไหร่", "เท่าไร", "คิดยัง", "คิดเท่า", "คิดกี่",
    "ต่อหัว", "ต่อโต๊ะ", "ต่อท่าน", "ราคาต่อ",
  ],
  addon: [
    "เพิ่มเมนู", "เพิ่มอาหาร", "เพิ่มรายการ", "เพิ่มจาน", "เพิ่มของหวาน",
    "add on", "add-on", "addon", "แอดออน", "เมนูเสริม", "อาหารเพิ่ม",
    "ของหวานเพิ่ม", "รายการอาหารเพิ่ม",
  ],
  service_fee: [
    "ค่าบริการ", "ค่าเซอร์วิส", "service charge", "ค่าพนักงาน", "พนักงาน",
    "พนักงานเสิร์ฟ", "พนักงานดูแล", "ค่าอุปกรณ์", "ค่าเช่า",
    "บริการพิเศษ", "เจ้าหน้าที่", "สตาฟ", "staff",
    "ค่าเซตอัพ", "setup", "ค่าติดตั้ง",
  ],
  discount: [
    "ส่วนลด", "ลดราคา", "ลดได้", "ลดให้", "ลดเพิ่ม",
  ],
  promotion: [
    "โปรโมชั่น", "โปรโมชัน", "โปร", "แคมเปญ", "campaign", "promotion",
  ],
  min_order: [
    "ขั้นต่ำ", "min order", "min pax", "จำนวนขั้นต่ำ", "น้อยสุด",
    "รับงานขั้นต่ำ",
  ],
  delivery_fee: [
    "ค่าส่ง", "ค่าขนส่ง", "ค่าเดินทาง", "ค่าจัดส่ง", "ต่างจังหวัด",
    "delivery", "ระยะทาง", "ค่ารถ",
  ],
  package_condition: [
    "เงื่อนไข", "แพ็กเกจ", "packet", "package", "มัดจำ", "ค่ามัดจำ",
    "การชำระ", "จ่ายเงิน", "ยกเลิก", "เลื่อนงาน",
  ],
};

// Aggregate — used by detectBusinessQuestion.
const ALL_BUSINESS_KEYWORDS: readonly string[] = Object.values(CATEGORY_KEYWORDS).flat();

function normalize(s: string): string {
  return String(s || "").toLowerCase();
}

function categoriesOf(text: string | null | undefined): Set<CatKey> {
  const out = new Set<CatKey>();
  if (!text) return out;
  const t = normalize(text);
  for (const cat of Object.keys(CATEGORY_KEYWORDS) as CatKey[]) {
    for (const kw of CATEGORY_KEYWORDS[cat]) {
      if (t.includes(kw.toLowerCase())) { out.add(cat); break; }
    }
  }
  return out;
}

export function detectBusinessQuestion(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const t = normalize(messageText);
  for (const kw of ALL_BUSINESS_KEYWORDS) {
    if (t.includes(kw.toLowerCase())) return true;
  }
  return false;
}

function coerceDecision(v: unknown): BusinessDataDecision | null {
  if (typeof v !== "string") return null;
  return (DECISIONS as readonly string[]).includes(v) ? (v as BusinessDataDecision) : null;
}

function coerceCategory(v: unknown): BusinessDataCategory | null {
  if (typeof v !== "string") return null;
  return (CATEGORIES as readonly string[]).includes(v) ? (v as BusinessDataCategory) : null;
}

function coerceIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
  }
  return out;
}

/** Retrieved KB/pkg/promo row descriptor. `text` is used for source-topic validation. */
export interface RetrievedSource {
  id: string;
  /** Concatenation of title + content (any human-readable text) to categorize the source. */
  text?: string | null;
}

export interface ResolveInput {
  /** Raw AI JSON (already parsed). May be missing/invalid fields. */
  rawParsed: unknown;
  /**
   * Rich source descriptors — REQUIRED for source-topic validation (Phase 3.1).
   * If omitted, resolver falls back to id-only validation (legacy behavior).
   */
  retrievedSources?: readonly RetrievedSource[];
  /** Legacy input — id-only. Ignored when `retrievedSources` is supplied. */
  retrievedSourceIds?: readonly string[];
  /** Customer message text (used both for the handoff record and topic categorization). */
  messageText: string;
}

export type HandoffReason =
  | "answer_from_source"
  | "not_applicable"
  | "handoff_missing_source"
  | "handoff_conflicting_source"
  | "handoff_source_mismatch"
  | "handoff_source_topic_mismatch"
  | "handoff_invalid_schema"
  | "generic_discovery_keep";

// Phase 3.2 — Business question intent classifier.
// Used to gate source-validation handoffs so generic discovery questions
// ("ขอดูราคาแพ็กเกจหน่อยค่ะ") never fall into the strict source-mismatch path.
export type BusinessQuestionIntent =
  | "generic_discovery"
  | "specific_fact"
  | "non_business";

// Markers that indicate the customer is asking for a specific verifiable fact
// (price per unit, percentage, policy/VAT/deposit/refund/cancel, distance fee).
// If ANY marker matches → specific_fact. Otherwise a business-keyword question
// is treated as generic_discovery.
const SPECIFIC_FACT_PATTERNS: RegExp[] = [
  // per-unit price wording
  /คนละ|ตัวละ|โต๊ะละ|หัวละ|ท่านละ|ที่ละ/,
  /ต่อ(คน|โต๊ะ|หัว|ท่าน|ที่|กิโล|ก\.ม\.|km)/i,
  // explicit quantifier ("กี่บาท", "กี่%", "กี่เปอร์เซ็นต์", "กี่คน/โต๊ะ")
  /กี่\s*(บาท|%|เปอร์เซ็นต์|คน|โต๊ะ|ตัว|ท่าน|หัว|กิโล|ก\.ม\.|km)/i,
  // add-on / extra with quantifier
  /เพิ่ม[^\n]{0,20}(กี่|เท่าไหร่|เท่าไร|ราคา)/,
  // policy / accounting words (always specific)
  /มัดจำ|คืนเงิน|ยกเลิก(งาน|แล้ว|ได้)?|vat|ภาษี|ส่วนลด/i,
  // delivery / distance fees
  /(ค่า(ส่ง|ขนส่ง|เดินทาง|รถ)|ระยะทาง)[^\n]{0,20}(เท่าไหร่|เท่าไร|กี่)/,
];

export function classifyBusinessQuestionIntent(text: string | null | undefined): BusinessQuestionIntent {
  if (!text) return "non_business";
  const t = String(text);
  for (const re of SPECIFIC_FACT_PATTERNS) {
    if (re.test(t)) return "specific_fact";
  }
  return detectBusinessQuestion(text) ? "generic_discovery" : "non_business";
}

export interface ResolveOutput {
  action: "keep" | "handoff";
  reason: HandoffReason;
  decision: BusinessDataDecision;
  category: BusinessDataCategory;
  modelSourceIds: string[];
  validatedSourceIds: string[];
  /** IDs that passed BOTH id-membership AND source-topic checks. */
  topicMatchedSourceIds: string[];
  fallbackText: string;
  question: string;
  isBusinessQuestion: boolean;
  /** Categories inferred from the question (server-side, for trace/debug). */
  questionCategories: CatKey[];
  /** Phase 3.2 — server-side intent classification (drives handoff gating). */
  intent: BusinessQuestionIntent;
}

/**
 * Decide whether to keep the AI reply or replace it with a structured handoff.
 *
 * Rules (spec §3, §4 + Phase 3.1 topic validation):
 *  - decision === "answer_from_source"
 *      a) validate: source_ids non-empty AND every id ∈ retrieved
 *         → fail → handoff (reason=handoff_source_mismatch)
 *      b) if `retrievedSources` supplied with text AND question has business
 *         categories → require ≥1 validated source whose text shares a
 *         category with the question (OR with the model's declared category)
 *         → fail → handoff (reason=handoff_source_topic_mismatch)
 *      c) both pass → keep
 *  - decision === "handoff_missing_source" / "handoff_conflicting_source"
 *      → handoff (reason = same)
 *  - decision === "not_applicable"
 *      → if server heuristic detects a business question → handoff_missing_source
 *      → else keep
 *  - decision missing / invalid / schema invalid
 *      → if business question → handoff (reason=handoff_invalid_schema)
 *      → else keep (non-business, safe to pass through)
 *
 * The model's source_ids are NEVER trusted on their own — they are always
 * intersected with retrieved ids computed by the server; and (Phase 3.1) their
 * content must actually address the topic of the question.
 */
export function resolveBusinessDataHandoff(input: ResolveInput): ResolveOutput {
  // Normalize retrieved sources — prefer rich descriptors when supplied.
  const richSources: RetrievedSource[] = Array.isArray(input.retrievedSources)
    ? input.retrievedSources.filter((s) => s && typeof s.id === "string" && s.id.trim())
        .map((s) => ({ id: s.id.trim(), text: s.text ?? null }))
    : [];
  const legacyIds = (input.retrievedSourceIds || []).filter((x) => typeof x === "string" && x);
  const retrievedIds = richSources.length > 0
    ? richSources.map((s) => s.id)
    : legacyIds;
  const retrievedSet = new Set(retrievedIds);
  const sourceById = new Map<string, RetrievedSource>(richSources.map((s) => [s.id, s]));

  const question = String(input.messageText || "").slice(0, 500);
  const isBusinessQuestion = detectBusinessQuestion(input.messageText);
  const questionCats = categoriesOf(input.messageText);
  const questionCategories: CatKey[] = Array.from(questionCats);

  const parsed = (input.rawParsed && typeof input.rawParsed === "object") ? (input.rawParsed as Record<string, unknown>) : {};
  const decision = coerceDecision(parsed["business_data_decision"]);
  const category = coerceCategory(parsed["business_data_category"]) ?? "none";
  const modelSourceIds = coerceIdList(parsed["business_data_source_ids"]);
  const validatedSourceIds = modelSourceIds.filter((id) => retrievedSet.has(id));

  // Source-topic validation (Phase 3.1):
  // "pricing" is a *modality* ("how much"), not a topic — every priced source
  // hits it, so it cannot prove topical alignment on its own. Require a
  // NON-pricing category overlap between the question and the source. If the
  // question has NO non-pricing category (pure "ราคาเท่าไหร่") the topic check
  // is skipped and id-level validation stands.
  const stripPricing = (s: Set<CatKey>): Set<CatKey> => {
    const out = new Set(s); out.delete("pricing"); return out;
  };
  const qTopic = stripPricing(questionCats);
  const canTopicCheck = richSources.length > 0 && qTopic.size > 0;
  const topicMatchedSourceIds: string[] = canTopicCheck
    ? validatedSourceIds.filter((id) => {
        const src = sourceById.get(id);
        if (!src) return false;
        const sTopic = stripPricing(categoriesOf(src.text || ""));
        for (const c of sTopic) if (qTopic.has(c)) return true;
        return false;
      })
    : validatedSourceIds; // no topic check available → treat all validated as matched

  const base = {
    decision: (decision ?? "not_applicable") as BusinessDataDecision,
    category,
    modelSourceIds,
    validatedSourceIds,
    topicMatchedSourceIds,
    fallbackText: BUSINESS_DATA_FALLBACK_TEXT,
    question,
    isBusinessQuestion,
    questionCategories,
  };

  // Invalid / missing decision.
  if (decision === null) {
    if (isBusinessQuestion) {
      return { ...base, action: "handoff", reason: "handoff_invalid_schema" };
    }
    return { ...base, action: "keep", reason: "not_applicable" };
  }

  if (decision === "answer_from_source") {
    // (a) id-level check
    if (modelSourceIds.length === 0 || validatedSourceIds.length === 0) {
      return { ...base, action: "handoff", reason: "handoff_source_mismatch" };
    }
    // (b) topic-level check — only when we have rich descriptors + question cats
    if (canTopicCheck && topicMatchedSourceIds.length === 0) {
      return { ...base, action: "handoff", reason: "handoff_source_topic_mismatch" };
    }
    return { ...base, action: "keep", reason: "answer_from_source" };
  }

  if (decision === "handoff_missing_source" || decision === "handoff_conflicting_source") {
    return { ...base, action: "handoff", reason: decision };
  }

  // not_applicable
  if (isBusinessQuestion) {
    return { ...base, action: "handoff", reason: "handoff_missing_source" };
  }
  return { ...base, action: "keep", reason: "not_applicable" };
}
