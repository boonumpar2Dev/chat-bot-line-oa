// Package intent detection — pure/deterministic helpers.
//
// Used by:
//   - line-webhook prompt Phase 1 allowlist (all-package request → allow KB ซุ้ม/menu/example)
//   - line-webhook AntiSpam post-filter (askedForMenu equivalent for all_packages intent)
//   - line-webhook selected-package narrowing (Defect 2)
//   - existing-cycle-post-enforcement (factual vs current-job action gating — Defect 3)
//
// Scope of change is deliberately narrow: only touches package-detail intent,
// does NOT rewrite global keyword ranking or KB filtering.

export type PackageScope = "all" | "selected" | "specific" | "none";
export type PackageType = "buffet" | "chinese" | "station" | null;

export interface PackageIntent {
  scope: PackageScope;
  /** true if any factual info wording present (มีอะไรบ้าง / รายละเอียด / อยากทราบ …) */
  factualInfo: boolean;
  /** true if customer intends to change/confirm the current job (approval/change verbs) */
  currentJobAction: boolean;
  /** Resolved package type from EXPLICIT wording in this message only. null if not present. */
  specificType: PackageType;
}

// ── Wording tables ─────────────────────────────────────────────────────────

const ALL_PACKAGE_RE =
  /(?:ทุก(?:รูปแบบ|แบบ|ประเภท|แพ็ก(?:เกจ)?)|ทั้งหมด|ทั้ง\s*[23๒๓]\s*แบบ|[23๒๓]\s*แบบ(?:มี|มีอะไร|เลย)?|ขอครบทุกแบบ|ขอรายละเอียดทุกแบบ|ครบทุก(?:แพ็ก|แบบ|รูปแบบ))/;

const SELECTED_PACKAGE_RE =
  /(?:แพ็ก(?:เกจ)?ที่เลือก|ในแพ็ก(?:เกจ)?ที่เลือก|ที่เลือก(?:ไว้)?|แพ็ก(?:เกจ)?นี้)/;

const BUFFET_RE = /บุฟเฟ่ต์|บุฟเฟต์|บุฟเฟ่|บุฟเฟ|buffet/i;
const CHINESE_RE = /โต๊ะจีน|โตะจีน|chinese/i;
const STATION_RE = /ซุ้ม(?:อาหาร)?|food\s*station/i;

export const FACTUAL_INFO_RE =
  /(?:รายละเอียด|มี(?:อะไร|แบบ|รูปแบบ)?บ้าง|ประกอบด้วย|อยาก(?:ทราบ|รู้|ดู)|ขอ(?:ทราบ|ดูข้อมูล|รายละเอียด)|ต่างกันยังไง|ต่างกันอย่างไร|ทุกรูปแบบ|ทั้ง\s*[23๒๓]\s*แบบ)/;

// Current-job action verbs (customer wants to change/confirm current job).
// Anchored with a following ได้ไหม / ให้หน่อย / เลยค่ะ / ได้หรือเปล่า or standalone imperative form.
export const CURRENT_JOB_ACTION_RE =
  /(?:เปลี่ยน|เพิ่ม|ลด|สลับ|ใช้(?:แทน|ตามเดิม)?|ยืนยัน|จอง|อนุมัติ|แก้|ปรับ|เอา(?:ตาม)?เดิม)/;

// ── API ────────────────────────────────────────────────────────────────────

export function detectPackageIntent(msgIn: string | null | undefined): PackageIntent {
  const msg = String(msgIn ?? "");
  const factualInfo = FACTUAL_INFO_RE.test(msg);
  const currentJobAction = CURRENT_JOB_ACTION_RE.test(msg);

  const isAll = ALL_PACKAGE_RE.test(msg);
  const isSelected = SELECTED_PACKAGE_RE.test(msg);

  let specificType: PackageType = null;
  const hitBuffet = BUFFET_RE.test(msg);
  const hitChinese = CHINESE_RE.test(msg);
  const hitStation = STATION_RE.test(msg);
  const hits = [hitBuffet, hitChinese, hitStation].filter(Boolean).length;
  if (hits === 1) {
    specificType = hitBuffet ? "buffet" : hitChinese ? "chinese" : "station";
  }

  let scope: PackageScope = "none";
  if (isAll) scope = "all";
  else if (specificType) scope = "specific";
  else if (isSelected) scope = "selected";

  return { scope, factualInfo, currentJobAction, specificType };
}

/**
 * Resolve which package type the customer means, using ONLY existing data
 * (no new schema). Priority per approved spec:
 *   1. specific type in current message
 *   2. intent_data.service_type
 *   3. current structured event/service type
 *   4. specific type mention in recent history
 * Returns null when nothing resolvable and "ambiguous" when multiple candidates.
 */
export function resolveSelectedPackage(opts: {
  message: string;
  serviceType?: string | null;
  eventType?: string | null;
  recentHistoryText?: string | null;
}): PackageType | "ambiguous" {
  const intent = detectPackageIntent(opts.message);
  if (intent.specificType) return intent.specificType;

  const fromField = classifyPackageString(opts.serviceType);
  if (fromField) return fromField;

  const fromEvent = classifyPackageString(opts.eventType);
  if (fromEvent) return fromEvent;

  const hist = String(opts.recentHistoryText ?? "");
  const hitB = BUFFET_RE.test(hist);
  const hitC = CHINESE_RE.test(hist);
  const hitS = STATION_RE.test(hist);
  const hits = [hitB, hitC, hitS].filter(Boolean).length;
  if (hits === 1) return hitB ? "buffet" : hitC ? "chinese" : "station";
  if (hits > 1) return "ambiguous";

  return null;
}

function classifyPackageString(s: string | null | undefined): PackageType {
  if (!s) return null;
  if (BUFFET_RE.test(s)) return "buffet";
  if (CHINESE_RE.test(s)) return "chinese";
  if (STATION_RE.test(s)) return "station";
  return null;
}

/** Match a package/KB category string against a resolved PackageType. */
export function categoryMatchesPackageType(category: string | null | undefined, type: PackageType): boolean {
  if (!type || !category) return false;
  const c = String(category);
  if (type === "buffet") return BUFFET_RE.test(c);
  if (type === "chinese") return CHINESE_RE.test(c);
  if (type === "station") return STATION_RE.test(c);
  return false;
}
