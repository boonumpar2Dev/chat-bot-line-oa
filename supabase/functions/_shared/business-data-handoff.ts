// Phase 3 — Structured Business Data Handoff (shared: Legacy + Phase 2).
//
// Purpose: after the model returns, decide server-side whether the reply may be
// sent as-is or MUST be replaced by a real handoff (ai_active=false + banner).
//
// This module is PURE. No DB, no network, no globals. Deterministic outputs so
// Legacy and Phase 2 behave identically under the same inputs.
//
// The caller is responsible for:
//   1) collecting retrievedSourceIds from the KB/package/promo context passed
//      to the model on THIS turn (canonical source of truth),
//   2) persisting handoff state atomically when action === "handoff",
//   3) sending the fallback text on success and falling back to the safe path
//      (sendUnableToReply) on persistence failure.

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

// Heuristic keywords that mark a customer message as a "business-data question".
// Kept intentionally broad so we err on the side of triggering a handoff when
// the model omits/mangles the decision field.
const BUSINESS_KEYWORDS: readonly string[] = [
  "ราคา", "กี่บาท", "เท่าไหร่", "เท่าไร", "คิดยัง", "คิดเท่า", "คิดกี่",
  "ค่าเพิ่ม", "เพิ่มเมนู", "เพิ่มอาหาร", "add on", "แอดออน",
  "ค่าบริการ", "ค่าเซอร์วิส", "ค่าพนักงาน", "ค่าอุปกรณ์",
  "ส่วนลด", "ลดราคา", "โปร", "โปรโมชั่น", "แคมเปญ",
  "ขั้นต่ำ", "min", "min order",
  "ค่าส่ง", "ค่าขนส่ง", "ค่าเดินทาง", "ค่าจัดส่ง", "ต่างจังหวัด",
  "มัดจำ", "เงื่อนไข", "แพ็กเกจ", "packet", "package",
  "ต่อหัว", "ต่อโต๊ะ", "ต่อท่าน",
];

export function detectBusinessQuestion(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const t = String(messageText).toLowerCase();
  for (const kw of BUSINESS_KEYWORDS) {
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

export interface ResolveInput {
  /** Raw AI JSON (already parsed). May be missing/invalid fields. */
  rawParsed: unknown;
  /** IDs of KB/package/promo rows actually placed in the model's context THIS turn. */
  retrievedSourceIds: readonly string[];
  /** Customer message text (used both for the handoff record and the heuristic). */
  messageText: string;
}

export type HandoffReason =
  | "answer_from_source"
  | "not_applicable"
  | "handoff_missing_source"
  | "handoff_conflicting_source"
  | "handoff_source_mismatch"
  | "handoff_invalid_schema";

export interface ResolveOutput {
  action: "keep" | "handoff";
  reason: HandoffReason;
  decision: BusinessDataDecision;
  category: BusinessDataCategory;
  modelSourceIds: string[];
  validatedSourceIds: string[];
  fallbackText: string;
  question: string;
  isBusinessQuestion: boolean;
}

/**
 * Decide whether to keep the AI reply or replace it with a structured handoff.
 *
 * Rules (spec §3, §4):
 *  - decision === "answer_from_source"
 *      → validate: source_ids non-empty AND every id ∈ retrievedSourceIds
 *      → fail  → handoff (reason=handoff_source_mismatch)
 *      → pass  → keep
 *  - decision === "handoff_missing_source" / "handoff_conflicting_source"
 *      → handoff (reason = same)
 *  - decision === "not_applicable"
 *      → if server heuristic detects a business question → handoff_missing_source
 *      → else keep
 *  - decision missing / invalid / schema invalid
 *      → if business question → handoff_missing_source (reason=handoff_invalid_schema)
 *      → else keep (non-business, safe to pass through)
 *
 * The model's source_ids are NEVER trusted on their own — they are always
 * intersected with retrievedSourceIds computed by the server.
 */
export function resolveBusinessDataHandoff(input: ResolveInput): ResolveOutput {
  const retrieved = new Set((input.retrievedSourceIds || []).filter((x) => typeof x === "string" && x));
  const question = String(input.messageText || "").slice(0, 500);
  const isBusinessQuestion = detectBusinessQuestion(input.messageText);

  const parsed = (input.rawParsed && typeof input.rawParsed === "object") ? (input.rawParsed as Record<string, unknown>) : {};
  const decision = coerceDecision(parsed["business_data_decision"]);
  const category = coerceCategory(parsed["business_data_category"]) ?? "none";
  const modelSourceIds = coerceIdList(parsed["business_data_source_ids"]);
  const validatedSourceIds = modelSourceIds.filter((id) => retrieved.has(id));

  const base = {
    decision: (decision ?? "not_applicable") as BusinessDataDecision,
    category,
    modelSourceIds,
    validatedSourceIds,
    fallbackText: BUSINESS_DATA_FALLBACK_TEXT,
    question,
    isBusinessQuestion,
  };

  // Invalid / missing decision.
  if (decision === null) {
    if (isBusinessQuestion) {
      return { ...base, action: "handoff", reason: "handoff_invalid_schema" };
    }
    return { ...base, action: "keep", reason: "not_applicable" };
  }

  if (decision === "answer_from_source") {
    if (modelSourceIds.length === 0 || validatedSourceIds.length === 0) {
      return { ...base, action: "handoff", reason: "handoff_source_mismatch" };
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
