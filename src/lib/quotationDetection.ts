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
    { name: "BNP Quote", enabled: true, regex: "BNP-[NV](\\d{4})(\\d{2})", quoteType: "bnp_quote" },
    { name: "Food Quote H-N", enabled: true, regex: "H-N(\\d{4})(\\d{2})-\\d+", quoteType: "food_quote" },
  ],
  datePrefix: { enabled: true, regex: "^(\\d{2})(\\d{2})(\\d{4})", format: "DDMMBBBB" },
  referenceFilePrefixes: ["OLD-", "REF-", "อ้างอิง-", "ใบเก่า-"],
};

// statuses ที่ auto-เปลี่ยนเป็น pending_confirm ได้
const CAN_AUTO_MOVE = new Set(["new", "inquiry", "returning", "pending_quote", "cancelled", "completed"]);

export type DetectionResult =
  | { action: "status_updated"; reason: "new_quote_sent" | "new_cycle_after_completed"; matchedPattern: string }
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

// parse date prefix DDMMBBBB → Date (ค.ศ.) | null ถ้า invalid
function parseDatePrefix(fileName: string, cfg: QuotationConfig): Date | null {
  if (!cfg.datePrefix.enabled) return null;
  let re: RegExp;
  try { re = new RegExp(cfg.datePrefix.regex); } catch { return null; }
  const m = fileName.match(re);
  if (!m) return null;
  // format DDMMBBBB เท่านั้นที่ support ตอนนี้
  if (cfg.datePrefix.format !== "DDMMBBBB") return null;
  const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), be = parseInt(m[3], 10);
  if (!dd || !mm || !be) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  const yearCE = be - 543;
  if (yearCE < 2000 || yearCE > 2100) return null;
  const d = new Date(yearCE, mm - 1, dd);
  // validate: round-trip ต้องตรง (กัน 31/02 → 03/03)
  if (d.getFullYear() !== yearCE || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
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
    return { result, updated: result.action === "status_updated" };
  };

  let cfg: QuotationConfig;
  try { cfg = await loadQuotationConfig(); }
  catch { return log({ action: "skipped", reason: "invalid_config" }); }

  if (!cfg.enabled) return log({ action: "skipped", reason: "auto_detection_disabled" });

  const status = args.customer.status;
  // status ที่ห้าม auto
  if (status === "pending_confirm") return log({ action: "skipped", reason: "already_pending_confirm" });
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

    // 3) date prefix → ใบเก่า?
    const datePref = parseDatePrefix(fileName, cfg);
    if (datePref) {
      const diffDays = (messageSentAt.getTime() - datePref.getTime()) / 86400000;
      if (diffDays > cfg.allowedBackdateDays) {
        log({ action: "skipped", reason: "old_reference_quote" }, fileName);
        continue;
      }
      // diffDays < 0 (ไฟล์ลงวันที่อนาคต) → ปล่อยผ่าน (ถือเป็นใบใหม่)
    } else {
      // fallback: ใช้ปี พ.ศ. จาก regex group 1 (default pattern group 1 = YYBE 4 หลัก)
      const yearStr = matched.m[1];
      if (yearStr && /^\d{4}$/.test(yearStr)) {
        const quoteBE = parseInt(yearStr, 10);
        const currentBE = new Date().getFullYear() + 543;
        if (Math.abs(quoteBE - currentBE) > 1) {
          log({ action: "skipped", reason: "old_reference_quote" }, fileName);
          continue;
        }
      }
      // ไม่มี group → ไม่ block (ถือว่าผ่าน)
    }

    // ผ่านทุกด่าน → update
    const isNewCycle = status === "completed";
    const reason: "new_quote_sent" | "new_cycle_after_completed" = isNewCycle ? "new_cycle_after_completed" : "new_quote_sent";

    const updateData: any = {
      status: "pending_confirm",
      admin_seen_at: new Date().toISOString(),
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
