// Quotation auto-detection helper
// อ่าน config จาก app_settings.quotation_auto_detection, parse ชื่อไฟล์, ตัดสินว่า
// ควรเปลี่ยน customer.status → pending_confirm หรือไม่ + ทำ side-effect ครบเหมือน StatusSelector
//
// ปลอดภัย: ถ้า config ว่าง/พัง/regex compile ไม่ผ่าน → fallback (ไม่เปลี่ยน status, log reason)
// ไม่ throw ออกไปข้างนอก เพื่อกันหน้า Chats ล่ม

import { supabase } from "@/integrations/supabase/client";
import { syncTagsForStatusChange } from "@/lib/statusTags";

export type QuotationConfig = {
  enabled: boolean;
  allowedBackdateDays: number;
  allowCompletedToPendingConfirm: boolean;
  patterns: Array<{ name: string; enabled: boolean; regex: string; quoteType?: string }>;
  datePrefix: { enabled: boolean; regex: string; format: string };
  referenceFilePrefixes: string[];
};

export const DEFAULT_QUOTATION_CONFIG: QuotationConfig = {
  enabled: true,
  allowedBackdateDays: 7,
  allowCompletedToPendingConfirm: true,
  patterns: [
    // BNP document code — พบใน filename ได้ทุกตำแหน่ง (ต้น/กลาง/ท้าย).
    // capture group 1 = year BE (4 digits) เพื่อใช้ใน fallback validation.
    { name: "BNP Quote", enabled: true, regex: "BNP-[NV](\\d{4})\\d{2}-\\d+", quoteType: "bnp_quote" },
    // Legacy food quotes (H-N prefix). ปล่อยไว้เพื่อ backward compatibility.
    { name: "Food Quote H-N", enabled: true, regex: "H-N(\\d{4})(\\d{2})-\\d+", quoteType: "food_quote" },
  ],
  datePrefix: { enabled: true, regex: "^(\\d{2})(\\d{2})(\\d{4})", format: "DDMMBBBB" },
  referenceFilePrefixes: ["OLD-", "REF-", "อ้างอิง-", "ใบเก่า-"],
};

// statuses ที่ auto-เปลี่ยนเป็น pending_confirm ได้
const CAN_AUTO_MOVE = new Set(["new", "inquiry", "returning", "pending_quote", "cancelled", "completed"]);

export type DetectionResult =
  | { action: "status_updated"; reason: "new_quote_sent" | "new_cycle_after_completed"; matchedPattern: string }
  | { action: "ai_flags_refreshed"; reason: "quote_resent_in_pending_confirm"; matchedPattern: string }
  | {
      action: "skipped";
      reason:
        | "auto_detection_disabled"
        | "invalid_config"
        | "reference_prefix"
        | "no_pattern_matched"
        | "invalid_date_prefix"
        | "future_quote_date"
        | "old_reference_quote"
        | "already_pending_confirm"
        | "active_confirmed_job"
        | "postponed_job"
        | "status_not_allowed";
    };


export function validateQuotationConfig(raw: unknown): { ok: true; config: QuotationConfig } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "config ต้องเป็น object" };
  const c = raw as any;
  if (typeof c.enabled !== "boolean") return { ok: false, error: "enabled ต้องเป็น boolean" };
  if (typeof c.allowedBackdateDays !== "number" || !Number.isFinite(c.allowedBackdateDays) || c.allowedBackdateDays < 0) {
    return { ok: false, error: "allowedBackdateDays ต้องเป็น number >= 0" };
  }
  if (typeof c.allowCompletedToPendingConfirm !== "boolean") return { ok: false, error: "allowCompletedToPendingConfirm ต้องเป็น boolean" };
  if (!Array.isArray(c.patterns)) return { ok: false, error: "patterns ต้องเป็น array" };
  for (const [i, p] of c.patterns.entries()) {
    if (!p || typeof p !== "object") return { ok: false, error: `patterns[${i}] ต้องเป็น object` };
    if (typeof p.name !== "string" || !p.name) return { ok: false, error: `patterns[${i}].name ต้องเป็น string` };
    if (typeof p.enabled !== "boolean") return { ok: false, error: `patterns[${i}].enabled ต้องเป็น boolean` };
    if (typeof p.regex !== "string") return { ok: false, error: `patterns[${i}].regex ต้องเป็น string` };
    if (p.enabled) {
      try { new RegExp(p.regex, "i"); } catch (e: any) { return { ok: false, error: `patterns[${i}].regex compile ไม่ผ่าน: ${e.message}` }; }
    }
  }
  if (!c.datePrefix || typeof c.datePrefix !== "object") return { ok: false, error: "datePrefix ต้องเป็น object" };
  if (typeof c.datePrefix.enabled !== "boolean") return { ok: false, error: "datePrefix.enabled ต้องเป็น boolean" };
  if (typeof c.datePrefix.regex !== "string") return { ok: false, error: "datePrefix.regex ต้องเป็น string" };
  if (c.datePrefix.enabled) {
    try { new RegExp(c.datePrefix.regex); } catch (e: any) { return { ok: false, error: `datePrefix.regex compile ไม่ผ่าน: ${e.message}` }; }
  }
  if (!Array.isArray(c.referenceFilePrefixes) || !c.referenceFilePrefixes.every((x: any) => typeof x === "string")) {
    return { ok: false, error: "referenceFilePrefixes ต้องเป็น array of string" };
  }
  return { ok: true, config: c as QuotationConfig };
}

let cachedConfig: QuotationConfig | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function loadQuotationConfig(): Promise<QuotationConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_MS) return cachedConfig;
  try {
    const { data } = await supabase.from("app_settings").select("quotation_auto_detection").limit(1).maybeSingle();
    const raw = (data as any)?.quotation_auto_detection;
    const v = validateQuotationConfig(raw);
    cachedConfig = v.ok ? v.config : DEFAULT_QUOTATION_CONFIG;
  } catch {
    cachedConfig = DEFAULT_QUOTATION_CONFIG;
  }
  cachedAt = now;
  return cachedConfig;
}

export function invalidateQuotationConfigCache() { cachedConfig = null; cachedAt = 0; }

// ---- Bangkok date-only helpers ----------------------------------------------
// เทียบวันแบบ date-only เขต Asia/Bangkok เพื่อกัน timezone ของ browser
// ทำให้วันเหลื่อม (เช่น admin timezone UTC+0 → เที่ยงคืนไทยกลายเป็นวันก่อน)

// แทนวันไทยเป็น "UTC-midnight ของวันไทยนั้น" เพื่อเทียบ/ลบเป็นจำนวนวันได้ตรง ๆ
function bkkDateKeyFromYMD(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

// แปลง Date (instant) → date-key ของวันไทยที่ instant นั้นตกอยู่
function bkkDateKeyFromInstant(dt: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const y = parseInt(parts.find(p => p.type === "year")!.value, 10);
  const m = parseInt(parts.find(p => p.type === "month")!.value, 10);
  const d = parseInt(parts.find(p => p.type === "day")!.value, 10);
  return bkkDateKeyFromYMD(y, m, d);
}

function daysBetweenKeys(laterKey: number, earlierKey: number): number {
  return Math.round((laterKey - earlierKey) / 86400000);
}

// parse date prefix DDMMBBBB → Bangkok date-key (UTC ms ของ 00:00 วันไทย) | null
function parseDatePrefix(fileName: string, cfg: QuotationConfig): number | null {
  if (!cfg.datePrefix.enabled) return null;
  let re: RegExp;
  try { re = new RegExp(cfg.datePrefix.regex); } catch { return null; }
  const m = fileName.match(re);
  if (!m) return null;
  if (cfg.datePrefix.format !== "DDMMBBBB") return null;
  const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), be = parseInt(m[3], 10);
  if (!dd || !mm || !be) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  const yearCE = be - 543;
  if (yearCE < 2000 || yearCE > 2100) return null;
  // validate round-trip (กัน 31/02 → 03/03) โดยใช้ UTC เพื่อไม่ให้ timezone เพี้ยน
  const probe = new Date(Date.UTC(yearCE, mm - 1, dd));
  if (probe.getUTCFullYear() !== yearCE || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) return null;
  return bkkDateKeyFromYMD(yearCE, mm, dd);
}

type MarkResult = { result: DetectionResult; updated: boolean };

export async function markQuotationSent(args: {
  customer: { id: string; status: string; tags?: string[] | null };
  fileNames: string[];
  messageSentAt?: Date;
}): Promise<MarkResult> {
  const log = (result: DetectionResult, file?: string) => {
    // eslint-disable-next-line no-console
    console.info("[quotationDetection]", { customer: args.customer.id, file, ...result });
    return { result, updated: result.action === "status_updated" || result.action === "ai_flags_refreshed" };
  };

  let cfg: QuotationConfig;
  try { cfg = await loadQuotationConfig(); }
  catch { return log({ action: "skipped", reason: "invalid_config" }); }

  if (!cfg.enabled) return log({ action: "skipped", reason: "auto_detection_disabled" });

  const status = args.customer.status;
  // status ที่ห้าม auto
  // NOTE: pending_confirm ไม่ early-return — ถ้าเจอใบเสนอราคาใหม่ที่ valid → refresh AI flags
  // (กันเคส admin ส่งใบใหม่แต่ manual_chat_until ยังค้างจากรอบก่อน → AI เงียบ 14 วัน)

  if (status === "confirmed" || status === "confirmed_returning") return log({ action: "skipped", reason: "active_confirmed_job" });
  if (status === "postponed") return log({ action: "skipped", reason: "postponed_job" });
  if (!CAN_AUTO_MOVE.has(status)) return log({ action: "skipped", reason: "status_not_allowed" });
  if (status === "completed" && !cfg.allowCompletedToPendingConfirm) return log({ action: "skipped", reason: "status_not_allowed" });

  const messageSentAt = args.messageSentAt ?? new Date();
  const refPrefixes = cfg.referenceFilePrefixes ?? [];
  const enabledPatterns = (cfg.patterns ?? []).filter(p => p.enabled);

  // หา file แรกที่ valid; ถ้ามีหลายไฟล์ → update แค่ครั้งเดียว
  for (const fileName of args.fileNames) {
    // 1) reference prefix
    if (refPrefixes.some(pre => pre && fileName.startsWith(pre))) {
      log({ action: "skipped", reason: "reference_prefix" }, fileName);
      continue;
    }
    // 2) match pattern
    let matched: { name: string; m: RegExpMatchArray } | null = null;
    for (const p of enabledPatterns) {
      let re: RegExp;
      try { re = new RegExp(p.regex, "i"); } catch { continue; }
      const m = fileName.match(re);
      if (m) { matched = { name: p.name, m }; break; }
    }
    if (!matched) { log({ action: "skipped", reason: "no_pattern_matched" }, fileName); continue; }

    // 3) date prefix = **event date** (วันจัดงาน) — ห้ามใช้เป็น backdate validator
    //    ของใบเสนอราคา เพราะ event อาจย้อนหลังจริงตาม flow (เช่น ส่งใบใหม่หลัง event
    //    หรือใบสำหรับงานที่เพิ่งผ่านมา). คงไว้เฉพาะ future-sanity check.
    const datePrefKey = parseDatePrefix(fileName, cfg);
    if (datePrefKey !== null) {
      const sentKey = bkkDateKeyFromInstant(messageSentAt);
      const diffDays = daysBetweenKeys(sentKey, datePrefKey); // + = past event, - = future event
      if (diffDays < -730) {
        // event date อนาคตเกิน 2 ปี → น่าจะพิมพ์ปีผิด
        log({ action: "skipped", reason: "future_quote_date" }, fileName);
        continue;
      }
      // NOTE: `cfg.allowedBackdateDays` intentionally NOT applied to event date.
    }

    // Quote-year validation (จาก document code regex group 1) — ทำเสมอ ไม่ว่าจะมี date prefix
    // หรือไม่ เพราะเป็น year ของ "เอกสารใบเสนอราคา" ไม่ใช่ของ event
    {
      const yearStr = matched.m[1];
      if (yearStr && /^\d{4}$/.test(yearStr)) {
        const quoteBE = parseInt(yearStr, 10);
        const currentBE = new Date().getFullYear() + 543;
        if (Math.abs(quoteBE - currentBE) > 1) {
          log({ action: "skipped", reason: "old_reference_quote" }, fileName);
          continue;
        }
      }
    }

    // ผ่านทุกด่าน → update
    // เคสพิเศษ: status เป็น pending_confirm อยู่แล้ว → refresh AI flags ไม่ต้องเปลี่ยน status/tags
    if (status === "pending_confirm") {
      const { error } = await supabase.from("customers").update({
        ai_active: true,
        manual_chat_until: null,
        admin_bot_override: false,
      }).eq("id", args.customer.id);
      if (error) {
        console.error("[quotationDetection] refresh flags failed", error);
        return log({ action: "skipped", reason: "invalid_config" }, fileName);
      }
      return log({ action: "ai_flags_refreshed", reason: "quote_resent_in_pending_confirm", matchedPattern: matched.name }, fileName);
    }

    const isNewCycle = status === "completed";
    const reason: "new_quote_sent" | "new_cycle_after_completed" = isNewCycle ? "new_cycle_after_completed" : "new_quote_sent";

    // หมายเหตุ: ไม่แตะ admin_seen_at ที่นี่ — Chats.tsx เรียก markCustomerSeen() ก่อนแล้ว
    const updateData: any = {
      status: "pending_confirm",
      ai_active: true,
      manual_chat_until: null,
      admin_bot_override: false,
    };
    try {
      updateData.tags = await syncTagsForStatusChange(status, "pending_confirm", args.customer.tags ?? []);
    } catch { /* skip tag sync ถ้าโหลด map ไม่ได้ */ }

    const { error } = await supabase.from("customers").update(updateData).eq("id", args.customer.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[quotationDetection] update failed", error);
      return log({ action: "skipped", reason: "invalid_config" }, fileName);
    }
    return log({ action: "status_updated", reason, matchedPattern: matched.name }, fileName);

  }

  return log({ action: "skipped", reason: "no_pattern_matched" });
}
