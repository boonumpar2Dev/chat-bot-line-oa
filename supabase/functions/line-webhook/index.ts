import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildKbBlock, buildPackageBlock, buildPromoBlock, countTokens, truncateToTokens, filterRelevantKB } from "../_shared/ai-context.ts";
import { buildPrompt } from "../_shared/prompt-builder.ts";
import { logTokenUsage } from "../_shared/log-token-usage.ts";
import { getLineConfig } from "../_shared/line-config.ts";
import { extractVenueLocation, fmtLocationMessage } from "../_shared/location.ts";
import { resolveAiReplyPolicy, resolveLifecycle, buildCurrentCustomerContextBlock, buildConfirmedMissingContextBlock, resolvePhase2Gate, normalizeThaiPoliteness, isPostQuoteContext, isLowInfoAck, type Lifecycle, type ReplyMode } from "../_shared/ai-policy.ts";
import { resolveServiceScope, buildServiceScopeLockPrompt, filterPackagesByScope, filterKbByScope, type ServiceScope } from "../_shared/service-scope.ts";
import { buildNewCustomerProposalGuardBlock } from "../_shared/proposal-guard.ts";
import { resolveAdminHandoffDecision } from "../_shared/admin-handoff.ts";
import { evaluateAdminHandoffGuard } from "../_shared/admin-handoff-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
};

const processingIds = new Set<string>();
const AI_OFF_STATUSES = ["pending_quote", "confirmed", "confirmed_returning"];
// สถานะ "ปกป้อง" — ระบบจะไม่แตะ ai_active/status อัตโนมัติเมื่อ admin_bot_override=true
const PROTECTED_STATUSES = ["confirmed", "confirmed_returning", "postponed"];
const isProtectedStatus = (s: string | null | undefined) => !!s && PROTECTED_STATUSES.includes(s);
let LINE_TOKEN = ""; // loaded per-request from getLineConfig()
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Token budgets (ภาษาไทย char ≠ token, ใช้ token-based ดีกว่า char-based)
const BUDGET_KB = 3000;
const BUDGET_PACKAGES = 4500;
const BUDGET_PROMOS = 800;
const BUDGET_HISTORY = 2000;

// เรียก summarize-conversation แบบไม่รอผล
function triggerSummarize(customerId: string) {
  fetch(`${SUPABASE_URL}/functions/v1/summarize-conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ customer_id: customerId }),
  }).catch(e => console.error("[summarize trigger] failed:", e?.message));
}

// 📍 ดึงพิกัด venue จาก message (LINE location event หรือ Google Maps URL) → เก็บใน customer.intent_data.venue_location
// + คำนวณระยะทางจากร้านถ้ามีตั้ง shop_lat/shop_lng ใน app_settings
async function saveVenueIfAny(supabase: any, customer: any, event: any, text: string) {
  try {
    // เคารพข้อมูลเดิม: ถ้าเคยมี venue_location จาก LINE location แล้ว ไม่ overwrite ด้วย URL
    const existing = customer?.intent_data?.venue_location;
    const isFromLineLocation = event?.message?.type === "location";
    if (existing && existing.source === "line_location" && !isFromLineLocation) return;

    const { data: cfgArr } = await supabase.from("app_settings").select("shop_lat, shop_lng").eq("key", "ai_config").limit(1);
    const sc = cfgArr?.[0] || {};
    const origin = (Number.isFinite(+sc.shop_lat) && Number.isFinite(+sc.shop_lng))
      ? { lat: +sc.shop_lat, lng: +sc.shop_lng } : null;

    const res = await extractVenueLocation(event, text, origin);
    if (!res) return;
    const merged = { ...(customer.intent_data && typeof customer.intent_data === "object" ? customer.intent_data : {}), venue_location: res.venue };
    await supabase.from("customers").update({ intent_data: merged }).eq("id", customer.id);
    console.log(`[venue] saved ${res.venue.source} (${res.venue.lat},${res.venue.lng}) dist=${res.venue.distance_km ?? "-"}km`);
  } catch (e) {
    console.error("[venue] saveVenueIfAny error", e);
  }
}

// สรุปข้อมูลลูกค้าสำหรับส่งกลับ + ให้แอดมินอ่าน (ใช้ตอนปิดบอท handover)
function buildCustomerSummary(c: any, cfg: any): string[] {
  const header = (cfg?.handover_summary_header && String(cfg.handover_summary_header).trim()) || "📋 สรุปข้อมูลที่ได้รับ:";
  const lines: string[] = [header];
  const defaultFields = [
    { key: "nickname", label: "ชื่อ", enabled: true },
    { key: "phone", label: "เบอร์โทร", enabled: true },
    { key: "tax_id", label: "เลขผู้เสียภาษี/Tag", enabled: true },
    { key: "event_type", label: "ประเภทงาน", enabled: true },
    { key: "venue", label: "สถานที่/จังหวัด", enabled: true },
    { key: "event_date", label: "วันจัดงาน", enabled: true },
    { key: "guest_count", label: "จำนวนคน", suffix: " ท่าน", enabled: true },
  ];
  const fields = Array.isArray(cfg?.handover_summary_fields) && cfg.handover_summary_fields.length > 0
    ? cfg.handover_summary_fields
    : defaultFields;
  for (const f of fields) {
    if (!f?.key || f?.enabled === false) continue;
    const v = c?.[f.key];
    if (v === null || v === undefined || v === "") continue;
    const label = f.label || f.key;
    const suffix = f.suffix || "";
    lines.push(`- ${label}: ${v}${suffix}`);
  }
  const intentData = (c?.intent_data && typeof c.intent_data === "object") ? c.intent_data : {};
  const intentFields = Array.isArray(cfg?.intent_fields) ? cfg.intent_fields : [];
  for (const f of intentFields) {
    if (!f?.key) continue;
    const v = intentData[f.key];
    if (v === null || v === undefined || v === "") continue;
    const label = f.label || f.key;
    const valStr = Array.isArray(v) ? v.join(", ") : String(v);
    lines.push(`- ${label}: ${valStr}`);
  }
  return lines;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Call extract-event-from-chat (best-effort, with timeout) → merge into customer + persist
// Returns the (possibly enriched) customer object to use for buildCustomerSummary.
// Controlled by app_settings: handover_extract_enabled / _timeout_ms / _triggers / _overwrite_mode
async function runHandoverExtract(
  supabase: any,
  customer: any,
  cfg: any,
  trigger: "phone" | "tax_id",
): Promise<any> {
  try {
    if (cfg?.handover_extract_enabled === false) return customer;
    const triggers: string[] = Array.isArray(cfg?.handover_extract_triggers)
      ? cfg.handover_extract_triggers
      : ["phone", "tax_id"];
    if (!triggers.includes(trigger)) return customer;

    const timeoutMs = Math.max(500, Number(cfg?.handover_extract_timeout_ms) || 3000);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let extracted: any = {};
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/extract-event-from-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ customer_id: customer.id }),
        signal: ctrl.signal,
      });
      if (r.ok) {
        const j = await r.json();
        extracted = j?.extracted || {};
      } else {
        console.warn(`[HandoverExtract] non-200: ${r.status}`);
      }
    } catch (e: any) {
      console.warn(`[HandoverExtract] failed/timeout (${trigger}): ${e?.message || e}`);
      return customer;
    } finally {
      clearTimeout(t);
    }

    const mode = String(cfg?.handover_extract_overwrite_mode || "fill_only");
    const fields = ["event_type", "guest_count", "event_date", "venue"] as const;
    const update: Record<string, any> = {};
    const merged: Record<string, any> = { ...customer };
    for (const f of fields) {
      const newVal = (extracted as any)[f];
      if (newVal === null || newVal === undefined || newVal === "") continue;
      const existing = (customer as any)[f];
      const isEmpty = existing === null || existing === undefined || existing === "";
      if (mode === "overwrite" || isEmpty) {
        update[f] = newVal;
        merged[f] = newVal;
      }
    }
    // clv_amount: ทับเฉพาะเมื่อ extract ได้ค่า > 0 และ (mode=overwrite หรือ ปัจจุบัน=0)
    if (Number(extracted.total_amount) > 0) {
      const cur = Number(customer?.clv_amount) || 0;
      if (mode === "overwrite" || cur === 0) {
        update.clv_amount = Number(extracted.total_amount);
        merged.clv_amount = Number(extracted.total_amount);
      }
    }
    if (Object.keys(update).length > 0) {
      await supabase.from("customers").update(update).eq("id", customer.id);
      console.log(`[HandoverExtract:${trigger}] mode=${mode} updated:`, Object.keys(update).join(","));
    }
    return merged;
  } catch (e: any) {
    console.warn(`[HandoverExtract] unexpected error: ${e?.message || e}`);
    return customer;
  }
}


async function verifySignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === signature;
}

async function pushLine(to: string, messages: any[]): Promise<{ ok: boolean; status: number; sentMessages: any[] }> {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!r.ok) {
    console.error(`[PushFailed] ${r.status}: ${await r.text()}`);
    return { ok: false, status: r.status, sentMessages: [] };
  }
  let sentMessages: any[] = [];
  try { const body = await r.json(); if (Array.isArray(body?.sentMessages)) sentMessages = body.sentMessages; } catch {}
  return { ok: true, status: r.status, sentMessages };
}

// Lookup our outgoing conv row by LINE's quotedMessageId (customer quote-reply to admin/AI)
async function lookupQuotedConvId(supabase: any, customerId: string, quotedMessageId?: string | null): Promise<string | null> {
  if (!quotedMessageId) return null;
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .eq("line_message_id", quotedMessageId)
    .maybeSingle();
  return data?.id || null;
}

// Fire-and-forget delivery log (owner-only dashboard)
async function logDelivery(
  supabase: any,
  payload: {
    event_type: string;
    severity?: "info" | "warn" | "error";
    customer_id?: string | null;
    line_user_id?: string | null;
    conv_id?: string | null;
    message?: string | null;
    details?: Record<string, any>;
  },
) {
  try {
    await supabase.from("ai_delivery_logs").insert({
      event_type: payload.event_type,
      severity: payload.severity ?? "info",
      customer_id: payload.customer_id ?? null,
      line_user_id: payload.line_user_id ?? null,
      conv_id: payload.conv_id ?? null,
      message: payload.message ?? null,
      details: payload.details ?? {},
    });
  } catch (e) {
    console.error("[logDelivery failed]", (e as Error).message);
  }
}

// Fire-and-forget AI reply audit (owner/admin/manager dashboard)
async function logAiAudit(
  supabase: any,
  payload: {
    customer_id?: string | null;
    line_user_id?: string | null;
    customer_message?: string | null;
    ai_reply?: string | null;
    ai_reply_bubbles?: any[];
    image_titles?: string[];
    intent_extracted?: Record<string, any>;
    confidence?: number | null;
    model?: string | null;
    tokens_in?: number | null;
    tokens_out?: number | null;
    latency_ms?: number | null;
    recent_context?: string | null;
    status?: string;
    error?: string | null;
    packages_retrieved?: any[];
    knowledge_retrieved?: any[];
    system_prompt_excerpt?: string | null;
  },
) {
  try {
    await supabase.from("ai_reply_audit").insert({
      customer_id: payload.customer_id ?? null,
      line_user_id: payload.line_user_id ?? null,
      customer_message: (payload.customer_message ?? "").slice(0, 8000),
      ai_reply: (payload.ai_reply ?? "").slice(0, 8000),
      ai_reply_bubbles: payload.ai_reply_bubbles ?? [],
      image_titles: payload.image_titles ?? [],
      intent_extracted: payload.intent_extracted ?? {},
      confidence: payload.confidence ?? null,
      model: payload.model ?? null,
      tokens_in: payload.tokens_in ?? null,
      tokens_out: payload.tokens_out ?? null,
      latency_ms: payload.latency_ms ?? null,
      recent_context: (payload.recent_context ?? "").slice(0, 12000),
      status: payload.status ?? "sent",
      error: payload.error ?? null,
      packages_retrieved: payload.packages_retrieved ?? [],
      knowledge_retrieved: payload.knowledge_retrieved ?? [],
      system_prompt_excerpt: (payload.system_prompt_excerpt ?? "").slice(0, 4000) || null,
    });
  } catch (e) {
    console.error("[logAiAudit failed]", (e as Error).message);
  }
}

// Insert AI conversation row FIRST, then push to LINE. Rollback row if push fails.
async function saveAndPushAi(
  supabase: any,
  to: string,
  messages: any[],
  convRow: Record<string, any>,
): Promise<boolean> {
  const { data: inserted, error: insErr } = await supabase
    .from("conversations")
    .insert(convRow)
    .select("id")
    .single();
  if (insErr) {
    console.error(`[SaveAiFailed-pre-push]`, insErr.message);
    await logDelivery(supabase, {
      event_type: "save_failed_pre_push", severity: "error",
      customer_id: convRow.customer_id ?? null, line_user_id: to,
      message: convRow.message ?? null, details: { error: insErr.message },
    });
    return false;
  }
  const r = await pushLine(to, messages);
  if (!r.ok) {
    await supabase.from("conversations").delete().eq("id", inserted.id);
    console.error(`[Rollback] removed conv ${inserted.id} due to LINE push failure`);
    await logDelivery(supabase, {
      event_type: "rollback_push_failed", severity: "error",
      customer_id: convRow.customer_id ?? null, line_user_id: to,
      conv_id: inserted.id, message: convRow.message ?? null,
      details: { status: r.status },
    });
    return false;
  }
  // Save line_message_id of first sentMessage so customer can quote-reply this message later
  const firstId = r.sentMessages?.[0]?.id;
  if (firstId) await supabase.from("conversations").update({ line_message_id: firstId }).eq("id", inserted.id);
  await logDelivery(supabase, {
    event_type: "ai_reply_sent", severity: "info",
    customer_id: convRow.customer_id ?? null, line_user_id: to,
    conv_id: inserted.id, message: convRow.message ?? null,
    details: { bubbles: messages.length },
  });
  return true;
}

function getItemImages(item: any): string[] {
  return Array.isArray(item.image_urls) ? [...item.image_urls] : [];
}
function getItemVideos(item: any): { url: string; thumb_url: string }[] {
  return Array.isArray(item.video_urls) ? item.video_urls.filter((v: any) => v?.url && v?.thumb_url) : [];
}

// Parse วัน/เดือน (ไทย) จากข้อความลูกค้า — return YYYY-MM-DD หรือ null
// รองรับ "2 กรกฎาคม", "2 กค", "2 ก.ค.", "วันที่ 2 ก.ค.", "2/7", "2-7"
function parseThaiEventDate(text: string): string | null {
  if (!text) return null;
  const monthMap: Record<string, number> = {
    "มกราคม":1,"มกรา":1,"มค":1,"ม.ค":1,
    "กุมภาพันธ์":2,"กุมภา":2,"กพ":2,"ก.พ":2,
    "มีนาคม":3,"มีนา":3,"มีค":3,"มี.ค":3,
    "เมษายน":4,"เมษา":4,"เมย":4,"เม.ย":4,
    "พฤษภาคม":5,"พฤษภา":5,"พค":5,"พ.ค":5,
    "มิถุนายน":6,"มิถุนา":6,"มิย":6,"มิ.ย":6,
    "กรกฎาคม":7,"กรกฎา":7,"กค":7,"ก.ค":7,
    "สิงหาคม":8,"สิงหา":8,"สค":8,"ส.ค":8,
    "กันยายน":9,"กันยา":9,"กย":9,"ก.ย":9,
    "ตุลาคม":10,"ตุลา":10,"ตค":10,"ต.ค":10,
    "พฤศจิกายน":11,"พฤศจิ":11,"พย":11,"พ.ย":11,
    "ธันวาคม":12,"ธันวา":12,"ธค":12,"ธ.ค":12,
  };
  const monthKeys = Object.keys(monthMap).sort((a, b) => b.length - a.length);
  const monthAlt = monthKeys.map(k => k.replace(/\./g, "\\.")).join("|");
  let day = 0, month = 0;
  const re1 = new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(?:\\.?\\s*)?(${monthAlt})\\.?`, "i");
  const m1 = text.match(re1);
  if (m1) {
    day = parseInt(m1[1], 10);
    const key = m1[2].replace(/\./g, "");
    month = monthMap[key] ?? monthMap[m1[2]];
  } else {
    const m2 = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m2) { day = parseInt(m2[1], 10); month = parseInt(m2[2], 10); }
  }
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;
  const bkk = new Date(Date.now() + 7 * 3600000);
  let year = bkk.getUTCFullYear();
  const curMonth = bkk.getUTCMonth() + 1;
  const curDay = bkk.getUTCDate();
  if (month < curMonth || (month === curMonth && day < curDay)) year += 1;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}


async function callAI(systemPrompt: string, userPrompt: string, model = "google/gemini-3-flash-preview"): Promise<{ answer: string; confidence: number; image_titles?: string[]; confirm_existing_phone?: boolean; intent?: { event_type?: string | null; venue?: string | null; guest_count?: number | null; event_date?: string | null; nickname?: string | null }; extra_intent_json?: string; _usage?: any; _model?: string }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              confidence: { type: "number" },
              image_titles: { type: "array", items: { type: "string" } },
              confirm_existing_phone: { type: "boolean" },
              intent: {
                type: "object",
                additionalProperties: false,
                properties: {
                  event_type: { type: ["string", "null"] },
                  venue: { type: ["string", "null"] },
                  guest_count: { type: ["number", "null"] },
                  event_date: { type: ["string", "null"] },
                  nickname: { type: ["string", "null"], description: "ชื่อเล่น/ชื่อจริงที่ลูกค้าแนะนำตัว เช่น 'ชื่ออร' → 'อร' (ห้ามเดา ใส่ null ถ้าไม่ชัด)" },
                },
                required: ["event_type", "venue", "guest_count", "event_date", "nickname"],
              },
              extra_intent_json: { type: "string", description: 'JSON string of extra intent fields per app_settings.intent_fields whitelist, e.g. {"service_type":"บุฟเฟ่ต์"}. Use "{}" if nothing to add.' },
            },
            required: ["answer", "confidence", "image_titles", "confirm_existing_phone", "intent", "extra_intent_json"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return { ...parsed, _usage: data.usage, _model: model };
}

function extFromMime(mime: string, fallback: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("mpeg") && m.startsWith("audio")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("msword")) return "doc";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("ms-excel")) return "xls";
  if (m.includes("presentationml")) return "pptx";
  if (m.includes("ms-powerpoint")) return "ppt";
  if (m.includes("zip")) return "zip";
  if (m.includes("plain")) return "txt";
  if (m.includes("csv")) return "csv";
  return fallback;
}

async function uploadLineMedia(
  messageId: string,
  msgType: string,
  supabase: any,
  originalFileName?: string,
): Promise<{ url: string; ext: string; mime: string } | null> {
  try {
    const fallback = msgType === "image" ? "jpg" : msgType === "video" ? "mp4" : msgType === "audio" ? "m4a" : "bin";
    const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") || "";
    const blob = await r.blob();
    // Prefer extension from original file name → mime → fallback
    let ext = fallback;
    if (originalFileName && originalFileName.includes(".")) {
      const e = originalFileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (e && e.length <= 5) ext = e;
    } else {
      ext = extFromMime(mime || blob.type, fallback);
    }
    const fileName = `${msgType}_${messageId}.${ext}`;
    const { data, error } = await supabase.storage.from("line-media").upload(fileName, blob, { upsert: true, contentType: mime || blob.type || undefined });
    if (error) { console.error("upload error", error); return null; }
    const { data: pub } = supabase.storage.from("line-media").getPublicUrl(data.path);
    return { url: pub.publicUrl, ext, mime: mime || blob.type || "" };
  } catch (e) {
    console.error("media upload failed", e);
    return null;
  }
}

async function ocrImage(imageUrl: string, supabase: any, customerId?: string): Promise<string | null> {
  try {
    const model = "google/gemini-2.5-flash";
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "อ่านข้อความทั้งหมดในรูปนี้ออกมาเป็น plain text\n- ถ้าเป็นแคปแชท: แยก 'ผู้พูด: ข้อความ' ตามลำดับ\n- ถ้าเป็นใบเสนอราคา/เมนู/ตาราง: สรุปรายการ + ราคา\n- ถ้าไม่มีข้อความที่อ่านได้: บรรยายสั้นๆ ว่ารูปคืออะไร (ไม่เกิน 1 ประโยค)\nตอบสั้นกระชับไม่เกิน 500 ตัวอักษร ไม่ต้องมีคำนำ" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
      }),
    });
    if (!res.ok) { console.error(`[OCR] gateway ${res.status}`); return null; }
    const data = await res.json();
    logTokenUsage(supabase, { model, source: "ocr", apiResponse: data, customerId });
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return text.length > 0 ? text.slice(0, 800) : null;
  } catch (e) {
    console.error("[OCR] failed", e);
    return null;
  }
}

async function sendAndSave(supabase: any, customerId: string, lineUserId: string, text: string, extra: Record<string, any> = {}) {
  await saveAndPushAi(supabase, lineUserId, [{ type: "text", text }], { customer_id: customerId, message: text, sender: "ai", ...extra });
  await supabase.from("customers").update({
    last_message_at: new Date().toISOString(),
    last_message_snippet: `🤖 ${text.slice(0, 60)}`,
  }).eq("id", customerId);
}

async function processEvent(event: any, supabase: any) {
  const src = event.source || {};
  // รองรับทั้ง 1-1, group และ room — ใช้ ID ที่ใช้ push กลับได้ตรงๆ
  const sourceType: "user" | "group" | "room" =
    src.type === "group" ? "group" : src.type === "room" ? "room" : "user";
  const sourceId: string | undefined =
    sourceType === "group" ? src.groupId : sourceType === "room" ? src.roomId : src.userId;
  const lineUserId = sourceId;
  // เก็บ userId ของผู้ส่งจริงในกรุ๊ป (ถ้ามี) — ใช้ดึงโปรไฟล์คนที่พูด
  const senderUserId: string | undefined = src.userId;
  if (!lineUserId) return;
  if (event.deliveryContext?.isRedelivery) return;

  console.log(`[Event] type=${event.type} mode=${event.mode} source=${sourceType} id=${lineUserId}`);


  // Standby mode = admin took over
  if (event.mode === "standby") {
    const { data: existing } = await supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1);
    const customer = existing?.[0];
    if (!customer) return;
    if (!customer.manual_chat_until || new Date(customer.manual_chat_until) < new Date()) {
      const { data: cfgArr } = await supabase.from("app_settings").select("manual_chat_hours").eq("key", "ai_config").limit(1);
      const manualHours = cfgArr?.[0]?.manual_chat_hours || 360;
      const until = new Date(Date.now() + manualHours * 3600000).toISOString();
      await supabase.from("customers").update({ ai_active: false, manual_chat_until: until }).eq("id", customer.id);
    }
    if (event.type === "message" && event.message) {
      let text: string;
      if (event.message.type === "text") text = event.message.text;
      else if (event.message.type === "sticker") text = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
      else if (event.message.type === "location") text = fmtLocationMessage({ title: event.message.title, address: event.message.address, lat: event.message.latitude, lng: event.message.longitude });
      else if (["image","video","audio","file"].includes(event.message.type)) {
        const mt = event.message.type;
        const label = mt === "image" ? "รูปภาพ" : mt === "video" ? "วิดีโอ" : mt === "audio" ? "เสียง" : "ไฟล์";
        const origName: string | undefined = event.message?.fileName;
        const uploaded = await uploadLineMedia(event.message.id, mt, supabase, origName);
        const displayLabel = mt === "file" && origName ? `ไฟล์: ${origName}` : label;
        text = uploaded?.url ? `[${displayLabel}]\n📎 ${uploaded.url}` : `[${displayLabel}]`;
      } else {
        text = `[${event.message.type || "ไม่ทราบ"}]`;
      }
      const quotedConvId = await lookupQuotedConvId(supabase, customer.id, event.message?.quotedMessageId);
      await supabase.from("conversations").insert({ customer_id: customer.id, message: text, sender: "customer", line_message_id: event.message.id, quote_token: event.message.quoteToken || null, quoted_message_id: quotedConvId });
      const snippet = text.slice(0, 120);
      await supabase.from("customers").update({
        unread_count: (customer.unread_count || 0) + 1,
        last_message_at: new Date().toISOString(),
        last_message_snippet: snippet,
      }).eq("id", customer.id);
      await saveVenueIfAny(supabase, customer, event, text);
    }
    return;
  }

  if (event.type !== "message") return;
  const msgType = event.message?.type;

  let messageText: string;
  let isText = false;

  if (msgType === "text") {
    messageText = event.message.text;
    isText = true;
  } else if (["image", "video", "audio", "file"].includes(msgType)) {
    const label = msgType === "image" ? "รูปภาพ" : msgType === "video" ? "วิดีโอ" : msgType === "audio" ? "เสียง" : "ไฟล์";
    const origName: string | undefined = event.message?.fileName;
    const uploaded = await uploadLineMedia(event.message.id, msgType, supabase, origName);
    const fileUrl = uploaded?.url || null;
    const displayLabel = msgType === "file" && origName ? `ไฟล์: ${origName}` : label;
    messageText = fileUrl ? `[${displayLabel}]\n📎 ${fileUrl}` : `[${displayLabel}]`;
    // 📄 OCR: อ่านข้อความในรูป (เช่น แคปแชทจากที่อื่น) แล้วใส่เป็น context ให้ AI ตอบต่อได้
    if (msgType === "image" && fileUrl) {
      const ocr = await ocrImage(fileUrl, supabase);
      if (ocr) {
        messageText = `[${displayLabel}]\n📎 ${fileUrl}\n📄 เนื้อหาในรูป:\n${ocr}`;
        isText = true;
      }
    }
  } else if (msgType === "sticker") {
    messageText = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
  } else if (msgType === "location") {
    messageText = fmtLocationMessage({ title: event.message.title, address: event.message.address, lat: event.message.latitude, lng: event.message.longitude });
  } else {
    messageText = `[${msgType || "ไม่ทราบ"}]`;
  }

  // Find or create customer
  const { data: existing } = await supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1);
  let customer = existing?.[0];
  if (!customer) {
    let displayName = "ลูกค้าใหม่";
    let pictureUrl = "";
    if (sourceType === "group") {
      const r = await fetch(`https://api.line.me/v2/bot/group/${lineUserId}/summary`, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });
      if (r.ok) { const g = await r.json(); displayName = `[กรุ๊ป] ${g.groupName || "ไม่ระบุชื่อ"}`; pictureUrl = g.pictureUrl || ""; }
      else displayName = "[กรุ๊ป LINE]";
    } else if (sourceType === "room") {
      displayName = "[ห้องแชทหลายคน]";
    } else {
      const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });
      const profile = profileRes.ok ? await profileRes.json() : {};
      displayName = profile.displayName || "ลูกค้าใหม่";
      pictureUrl = profile.pictureUrl || "";
    }
    const { data: created } = await supabase.from("customers").insert({
      line_user_id: lineUserId,
      display_name: displayName,
      picture_url: pictureUrl,
      status: "new",
      // กรุ๊ป/ห้อง: ปิด AI auto-reply เสมอ — แอดมินตอบเองในหน้า /chats
      ai_active: sourceType === "user",
    }).select().single();
    customer = created;
  } else if (sourceType === "user") {
    // Refresh profile picture every 7 days (don't touch display_name — may be admin-edited)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const lastRefresh = customer.picture_refreshed_at ? new Date(customer.picture_refreshed_at).getTime() : 0;
    if (Date.now() - lastRefresh > SEVEN_DAYS_MS) {
      try {
        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          const newPic = profile.pictureUrl || "";
          const patch: any = { picture_refreshed_at: new Date().toISOString() };
          if (newPic && newPic !== customer.picture_url) patch.picture_url = newPic;
          await supabase.from("customers").update(patch).eq("id", customer.id);
          if (patch.picture_url) customer.picture_url = patch.picture_url;
        }
      } catch (e) { console.error("profile refresh failed", e); }
    }
  }


  // Dedup
  const lineMsgId = event.message?.id;
  if (lineMsgId) {
    if (processingIds.has(lineMsgId)) return;
    processingIds.add(lineMsgId);
    setTimeout(() => processingIds.delete(lineMsgId), 60000);
  }

  const snippet = messageText.slice(0, 120);
  const quotedConvId = await lookupQuotedConvId(supabase, customer.id, event.message?.quotedMessageId);
  await supabase.from("conversations").insert({ customer_id: customer.id, message: messageText, sender: "customer", line_message_id: lineMsgId, quote_token: event.message?.quoteToken || null, quoted_message_id: quotedConvId });
  await supabase.from("customers").update({
    unread_count: (customer.unread_count || 0) + 1,
    last_message_at: new Date().toISOString(),
    last_message_snippet: snippet,
  }).eq("id", customer.id);
  await saveVenueIfAny(supabase, customer, event, messageText);

  // 🚫 Group/Room: ไม่ให้ AI ตอบเด็ดขาด — เก็บข้อความให้แอดมินอ่าน/ตอบเองในหน้า /chats
  if (sourceType !== "user") return;

  if (!isText) return;


  // 🕐 Debounce: รอให้ลูกค้าพิมพ์เสร็จก่อนตอบ (กันพิมพ์หลายบรรทัดติดกัน)
  // อ่านค่า debounce_seconds จาก app_settings (ตั้งค่าได้จากหน้า Settings)
  if (lineMsgId) {
    const { data: dbCfgArr } = await supabase.from("app_settings").select("debounce_seconds").eq("key", "ai_config").limit(1);
    const debounceSec = Math.max(0, Number(dbCfgArr?.[0]?.debounce_seconds ?? 15));
    if (debounceSec > 0) {
      console.log(`[Debounce] waiting ${debounceSec}s customer=${customer.id} lineMsg=${lineMsgId}`);
      await new Promise(r => setTimeout(r, debounceSec * 1000));
      const { data: latestArr } = await supabase
        .from("conversations")
        .select("line_message_id")
        .eq("customer_id", customer.id)
        .eq("sender", "customer")
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = latestArr?.[0];
      if (latest && latest.line_message_id && latest.line_message_id !== lineMsgId) {
        console.log(`[Debounce ${debounceSec}s] skip ${lineMsgId} — newer customer message arrived`);
        return;
      }
    }
  }

  const trimmed = messageText.trim().toLowerCase();

  const [{ data: cfgArr }, { data: freshArr }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("key", "ai_config").limit(1),
    supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1),
  ]);
  const cfg = cfgArr?.[0] || {};
  const freshCustomer = freshArr?.[0] || customer;

  // โหลดประวัติงานเก่า (customer_events) — ใช้สร้างบริบทลูกค้าเก่า/VIP
  const { data: pastEventsArr } = await supabase
    .from("customer_events")
    .select("event_type, guest_count, event_date, venue, package_name, total_amount, status")
    .eq("customer_id", freshCustomer.id)
    .order("event_date", { ascending: false, nullsFirst: false })
    .limit(5);
  const pastEvents = pastEventsArr || [];

  // 🔁 Auto-flip: ลูกค้าเคยจัดงานแล้ว (มี customer_events จริง) แล้วกลับมาทักใหม่
  //   → เปลี่ยน confirmed → returning + ติด tag "ลูกค้าเก่า"
  //   ❗ ไม่แตะ ai_active / manual_chat_until — เคารพการตัดสินใจของแอดมิน
  //   ❗ ไม่ใช้ tag เดือน/ปี ตัดสิน (false positive สูง เพราะ tag เดือน/ปีอาจมาจากงานปัจจุบัน)
  if (freshCustomer.status === "confirmed") {
    const todayIso = new Date().toISOString().slice(0, 10);
    const hasPastEvent = pastEvents.some((e: any) =>
      e?.status === "completed" || (e?.event_date && e.event_date < todayIso)
    );
    if (hasPastEvent) {
      const tags: string[] = Array.isArray(freshCustomer.tags) ? freshCustomer.tags : [];
      const newTags = Array.from(new Set([...tags, "ลูกค้าเก่า"]));
      await supabase.from("customers").update({
        status: "returning",
        customer_origin: "returning",
        tags: newTags,
      }).eq("id", freshCustomer.id);
      freshCustomer.status = "returning";
      freshCustomer.tags = newTags;
      console.log(`[auto-flip] ${freshCustomer.id}: confirmed → returning (มี past event จริง)`);
    }
  }

  // 🔁 ลูกค้าปิดงานแล้ว (completed) กลับมาทักใหม่ → returning
  //    (auto-complete cron set status=completed หลังวันจัดงานผ่าน)
  if (freshCustomer.status === "completed") {
    const tags: string[] = Array.isArray(freshCustomer.tags) ? freshCustomer.tags : [];
    const newTags = Array.from(new Set([...tags, "ลูกค้าเก่า"]));
    await supabase.from("customers").update({
      status: "returning",
      customer_origin: "returning",
      tags: newTags,
    }).eq("id", freshCustomer.id);
    freshCustomer.status = "returning";
    freshCustomer.tags = newTags;
    console.log(`Customer returned after completed event: ${freshCustomer.id}`);
  }



  // 🚫 AI ปิดอยู่ / อยู่ในช่วง manual chat → เงียบสนิท ไม่ตอบอะไรเลย (ไม่ validate เบอร์/tax ด้วย)
  if (!freshCustomer.ai_active) return;
  if (freshCustomer.manual_chat_until && new Date(freshCustomer.manual_chat_until) > new Date()) {
    // Patch 1.1 Fix 1 — narrow bypass: อนุญาต canned reply เฉพาะ post-quote low-info ack เท่านั้น
    // เงื่อนไข: isPostQuoteContext && isLowInfoAck && ยังไม่เคยส่ง canned ใน round นี้
    // ห้าม bypass สำหรับคำถามจริง / new / inquiry / long text
    try {
      if (cfg?.ai_enabled === false) {
        console.log(`[ManualPause] skipped AI reply due to manual_chat_until (ai_enabled=false, customer=${customer.id})`);
        return;
      }
      const { data: _pauseConvs } = await supabase
        .from("conversations").select("sender, message, created_at")
        .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(8);
      const _pauseIsPostQuote = isPostQuoteContext(freshCustomer?.status ?? customer.status, _pauseConvs || []);
      const _pauseIsAck = isLowInfoAck(messageText, { messageType: msgType });
      if (_pauseIsPostQuote && _pauseIsAck) {
        const POST_QUOTE_ACK_REPLY = "หากมีคำถามเพิ่มเติม สอบถามได้ตลอดเลยนะคะ 🙏";
        const alreadySent = (_pauseConvs || []).some((m: any) =>
          m.sender === "ai" && typeof m.message === "string" && m.message.includes("หากมีคำถามเพิ่มเติม สอบถามได้ตลอด")
        );
        if (alreadySent) {
          console.log(`[PostQuoteAckBypass] suppressed — canned already sent in round (customer=${customer.id})`);
          return;
        }
        console.log(`[PostQuoteAckBypass] allowed during manual pause (customer=${customer.id}, status=${freshCustomer?.status ?? customer.status}, msgType=${msgType})`);
        await saveAndPushAi(supabase, lineUserId, [{ type: "text", text: POST_QUOTE_ACK_REPLY }], { customer_id: customer.id, message: POST_QUOTE_ACK_REPLY, sender: "ai" });
        return;
      }
      console.log(`[ManualPause] skipped AI reply due to manual_chat_until (customer=${customer.id}, isPostQuote=${_pauseIsPostQuote}, isAck=${_pauseIsAck})`);
    } catch (e) {
      console.error(`[ManualPause] bypass check failed (non-fatal, customer=${customer.id})`, (e as Error)?.message);
    }
    return;
  }

  // ─── Patch 2.9.1 — AdminHandoffGuard (containment-gated) ─────────────
  // Deterministic handoff for confirmed/confirmed_returning/pending_confirm
  // when the customer sends a change-request / staff-action / verify-needed
  // intent. Runs BEFORE schedule gate + AI generate. When matched:
  //   • Reply deterministically (no AI, no echo, no follow-up question)
  //   • Force ai_active=false via shared helper (reason=admin_handoff_guard)
  //     — this IGNORES admin_bot_override by design (see admin-handoff.ts)
  //   • return immediately (no downstream context build / AI call)
  //
  // 🛡️ Containment (post-2.9.1 audit): Guard is restricted to the SAME
  // rollout cohort as Phase 2 policy (test_customer_ids / live_rollout).
  // Customers outside the cohort NEVER enter the guard, regardless of
  // admin_handoff_guard.enabled. This is enforced at the call-site so we
  // don't mutate the pure evaluator, patterns, or replies.
  try {
    const _cohortGate = resolvePhase2Gate({
      customerId: freshCustomer?.id ?? null,
      settings: {
        advanced_ai_status_policy_enabled: cfg?.advanced_ai_status_policy_enabled ?? null,
        ai_policy_config: (cfg as any)?.ai_policy_config ?? null,
      },
    });
    if (!_cohortGate.enabled) {
      console.log(`[AdminHandoffGuard] cohort-skip customer=${freshCustomer?.id ?? "?"} reason=${_cohortGate.reason ?? "not-in-cohort"}`);
      // fall through to legacy flow — do NOT run guard evaluator at all
    } else {
      const _handoffCfg = (cfg as any)?.ai_policy_config?.admin_handoff_guard
        ?? (cfg as any)?.admin_handoff_guard
        ?? null;
      const _guard = evaluateAdminHandoffGuard({
        lifecycle: freshCustomer?.status ?? null,
        messageText,
        config: _handoffCfg,
      });
      if (_guard.matched) {
        const muteH = cfg?.fallback_mute_hours ?? 1;
        const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
        const _decision = resolveAdminHandoffDecision({
          adminBotOverride: freshCustomer?.admin_bot_override,
          reason: "admin_handoff_guard",
        });
        await saveAndPushAi(
          supabase,
          lineUserId,
          [{ type: "text", text: _guard.replyText }],
          { customer_id: customer.id, message: _guard.replyText, sender: "ai", is_fallback: true },
        );
        const patch: Record<string, unknown> = {
          manual_chat_until: muteUntil,
          last_message_at: new Date().toISOString(),
          last_message_snippet: `🤝 ${_guard.replyText.slice(0, 60)}`,
        };
        if (_decision.disableAi) patch.ai_active = false;
        await supabase.from("customers").update(patch).eq("id", customer.id);
        console.log(
          `[AdminHandoffGuard] matched customer=${customer.id} cohort=${_cohortGate.mode} status=${freshCustomer?.status ?? "?"} category=${_guard.category} pattern=${_guard.matchedPattern} override=${freshCustomer?.admin_bot_override === true} disableAi=${_decision.disableAi}`,
        );
        return;
      }
      console.log(`[AdminHandoffGuard] in-cohort skip status=${freshCustomer?.status ?? "?"} reason=${_guard.reason}`);
    }
  } catch (e: any) {
    console.error("[AdminHandoffGuard] error (non-fatal, continuing legacy flow):", e?.message);
  }



  // 🔎 Phase 1.5 — Observe-only AI policy hook.
  // - Runs ONLY when advanced_ai_status_policy_enabled=true (default false → 100% legacy path).
  // - Pure observation via console.log. Does NOT branch, mutate, or affect reply behavior.
  // - Errors are swallowed so webhook continues exactly as before.
  if (cfg?.advanced_ai_status_policy_enabled === true) {
    try {
      const policy = resolveAiReplyPolicy(
        {
          id: freshCustomer.id,
          status: freshCustomer.status,
          ai_active: freshCustomer.ai_active,
          manual_chat_until: freshCustomer.manual_chat_until,
          admin_bot_override: freshCustomer.admin_bot_override,
          customer_origin: freshCustomer.customer_origin,
        },
        {
          advanced_ai_status_policy_enabled: cfg.advanced_ai_status_policy_enabled,
          ai_policy_config: cfg.ai_policy_config ?? null,
          manual_chat_minutes: cfg.manual_chat_minutes ?? null,
          manual_chat_hours: cfg.manual_chat_hours ?? null,
        },
      );
      console.log("[AiPolicy:observe]", JSON.stringify({
        customer_id: freshCustomer.id,
        status: freshCustomer.status ?? null,
        canReply: policy.canReply,
        legacy: policy.legacy,
        replyMode: policy.replyMode,
        lifecycle: policy.lifecycle,
        reason: policy.reason,
      }));
    } catch (e) {
      console.error("[AiPolicy:observe] error (ignored):", (e as Error)?.message);
    }
  }

  if (freshCustomer.ai_resumed_at) {
    const msgMs = typeof event.timestamp === "number" ? event.timestamp : 0;
    if (msgMs > 0 && msgMs < new Date(freshCustomer.ai_resumed_at).getTime()) return;
  }

  // 🕐 Schedule gate มาก่อน — ในเวลา+วันทำการ บอทตอบทุกคน (ไม่สน whitelist)
  //    นอกเวลา/นอกวัน → whitelist ใช้เป็นโหมดทดสอบ (ตอบเฉพาะคนใน list), คนอื่นได้ OOH/เงียบ
  let inSchedule = true;
  if (cfg.schedule_enabled) {
    const bkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const hhmm = bkk.getHours() * 60 + bkk.getMinutes();
    const dow = bkk.getDay(); // 0=Sun..6=Sat
    const [sh, sm] = (cfg.start_time || "18:00").split(":").map(Number);
    const [eh, em] = (cfg.end_time || "08:00").split(":").map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    const inTime = start > end ? (hhmm >= start || hhmm < end) : (hhmm >= start && hhmm < end);
    const days: number[] = Array.isArray(cfg.schedule_days) && cfg.schedule_days.length > 0
      ? cfg.schedule_days
      : [0,1,2,3,4,5,6];
    const inDay = days.includes(dow);
    inSchedule = inTime && inDay;
  }

  const whitelistMode = cfg.ai_whitelist_enabled === true || cfg.bot_mode === "whitelist";
  const wl: string[] = Array.isArray(cfg.ai_whitelist_user_ids) ? cfg.ai_whitelist_user_ids : [];
  const inWhitelist = wl.includes(lineUserId);

  if (!inSchedule) {
    // นอกเวลาทำการ
    if (whitelistMode && inWhitelist) {
      console.log(`[Schedule] outside hours, but ${lineUserId} in whitelist — bypass`);
    } else {
      console.log(`[Schedule] outside ${cfg.start_time}-${cfg.end_time}`);
      if (cfg.out_of_hours_message_enabled && cfg.out_of_hours_message) {
        const oohText = String(cfg.out_of_hours_message).trim();
        const muteH = cfg.fallback_mute_hours ?? 1;
        const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
        await saveAndPushAi(supabase, lineUserId, [{ type: "text", text: oohText }], { customer_id: customer.id, message: oohText, sender: "ai", is_fallback: true });
        // 🕐 นอกเวลาทำการ: แค่กัน spam ด้วย manual_chat_until ระยะสั้น — ไม่ปิดบอท
        // รอบหน้าในเวลาทำการ บอทตอบต่อได้ทันที (ai_active ยังคงเดิม)
        await supabase.from("customers").update({
          manual_chat_until: muteUntil,
          last_message_at: new Date().toISOString(), last_message_snippet: `🕐 ${oohText.slice(0, 60)}`,
        }).eq("id", customer.id);
        console.log(`[Schedule] sent out-of-hours message + mute ${muteH}h (ai_active unchanged)`);
      }
      return;
    }
  }
  // ในเวลาทำการ → ตอบทุกคน, whitelist ไม่มีผล

  // master switch
  if (cfg.ai_enabled === false) return;


  // 🎯 Post-quote acknowledgement guard (deterministic) — ต้องรันก่อน trivial-skip + cooldown
  // เพราะ trivial-skip จะ return ทันทีเมื่อลูกค้าตอบ "ขอบคุณค่ะ" ฯลฯ ทำให้ AI เงียบหลังส่งใบเสนอราคา
  try {
    const { data: _guardConvs } = await supabase
      .from("conversations").select("sender, message, created_at")
      .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(8);
    const _isPostQuote = isPostQuoteContext(freshCustomer?.status ?? customer.status, _guardConvs || []);
    const _isAck = isLowInfoAck(messageText, { messageType: msgType });
    if (_isPostQuote && _isAck) {
      const POST_QUOTE_ACK_REPLY = "หากมีคำถามเพิ่มเติม สอบถามได้ตลอดเลยนะคะ 🙏";
      const alreadySent = (_guardConvs || []).some((m: any) =>
        m.sender === "ai" && typeof m.message === "string" && m.message.includes("หากมีคำถามเพิ่มเติม สอบถามได้ตลอด")
      );
      if (alreadySent) {
        console.log(`[Guard] post-quote ack — suppress (already replied, customer=${customer.id})`);
        return;
      }
      console.log(`[Guard] post-quote ack — canned reply (customer=${customer.id}, status=${freshCustomer?.status ?? customer.status}, msgType=${msgType})`);
      await saveAndPushAi(supabase, lineUserId, [{ type: "text", text: POST_QUOTE_ACK_REPLY }], { customer_id: customer.id, message: POST_QUOTE_ACK_REPLY, sender: "ai" });
      return;
    }
  } catch (e) {
    console.error("[Guard] post-quote ack check failed (non-fatal)", e);
  }

  // Skip pure acknowledgements (อ่านจาก cfg.trivial_replies)
  const trivial: string[] = (cfg.trivial_replies && cfg.trivial_replies.length) ? cfg.trivial_replies : [
    "👍","👌","🙏","❤️","ok","oki","okay","ได้เลย","โอเค","ขอบคุณ","ขอบคุณค่ะ","ขอบคุณครับ","ค่ะ","คะ","ครับ","คับ","ดีค่ะ","ดีครับ"
  ];
  if (trivial.map((t: string)=>t.toLowerCase()).includes(trimmed)) return;


  // เช็ค context: AI เพิ่งถาม Tag/Tax ID มาหรือเปล่า → ถ้าใช่ → treat reply ที่เป็นเลขเป็น Tax ID context
  const { data: lastAiArr } = await supabase
    .from("conversations")
    .select("message")
    .eq("customer_id", customer.id)
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastAiMsg = lastAiArr?.[0]?.message || "";
  const aiAskedTax = /(tag\s*id|เลขผู้เสีย|เลขประจำตัวผู้เสียภาษี|นิติบุคคล|tax\s*id)/i.test(lastAiMsg);
  const aiAskedPhone = /(ขอเบอร์|เบอร์โทร|เบอร์ติดต่อ|หมายเลขโทร|เบอร์ที่ติดต่อ|เบอร์มือถือ)/i.test(lastAiMsg);

  // Tax ID detection — ต้องมี context (keyword ในข้อความ หรือ AI เพิ่งถาม tax) ไม่งั้น 13 หลักอาจเป็น "เบอร์พิมพ์ผิด"
  // ยกเว้น: ถ้าลูกค้าพิมพ์ "เลข 13 หลักล้วนๆ" (ตัดช่องว่าง/ขีด/วงเล็บแล้วได้ 13 หลักพอดี) → ถือเป็น Tax ID ทันที
  const allDigitRuns = (messageText.match(/\d+/g) || []);
  const taxKwArr: string[] = (cfg.tax_id_keywords && cfg.tax_id_keywords.length) ? cfg.tax_id_keywords : ["tag","แท็ก","tax","ภาษี","เลขผู้เสีย","นิติบุคคล","จดทะเบียน"];
  const taxKwRe = new RegExp(taxKwArr.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"), "i");
  const taxKeyword = taxKwRe.test(messageText);
  const taxContext = taxKeyword || aiAskedTax;
  // pure 13-digit message → tax id (no other letters/chars)
  const cleaned13 = messageText.replace(/[\s\-().+]/g, "");
  const isPure13Digits = /^\d{13}$/.test(cleaned13);
  let taxId: string | null = null;
  let taxIdMaybe: string | null = null;
  let phoneTypo: string | null = null; // เลขที่น่าจะเป็นเบอร์แต่ความยาวผิด (เฉพาะตอน AI ถามเบอร์)
  if (isPure13Digits) {
    taxId = cleaned13;
  } else {
    for (const d of allDigitRuns) {
      // ถ้า AI กำลังถามเบอร์ + ไม่มี tax context → 11-13 หลัก = เบอร์พิมพ์ผิด ไม่ใช่ tax
      if (aiAskedPhone && !taxContext && d.length >= 11 && d.length <= 13) {
        if (!phoneTypo) phoneTypo = d;
        continue;
      }
      if (d.length === 13 && taxContext) { taxId = d; break; }
      if (taxKeyword && d.length >= 10 && d.length <= 13) { taxId = d; break; }
      if (!taxIdMaybe && taxContext) {
        if (d.length === 11 || d.length === 12) taxIdMaybe = d;
        else if (aiAskedTax && d.length >= 9 && d.length <= 14) taxIdMaybe = d;
      }
    }
  }
  // 🛡️ ลูกค้าสถานะปกป้อง (confirmed/postponed) ส่ง tax_id ใหม่ → save แบบไม่แตะ status/ai
  if (taxId && isProtectedStatus(freshCustomer.status)) {
    const oldNorm = String(freshCustomer.tax_id || "").replace(/\D/g, "");
    if (oldNorm === taxId) {
      console.log(`[Protected] same tax_id (${taxId}) — silent skip`);
      return;
    }
    await supabase.from("customers").update({ tax_id: taxId }).eq("id", customer.id);
    await supabase.from("conversations").insert({
      customer_id: customer.id, sender: "system",
      message: `🔔 ลูกค้าส่ง Tax ID ใหม่\nเก่า: ${freshCustomer.tax_id || "—"}\nใหม่: ${taxId}`,
    });
    console.log(`[Protected] tax_id changed ${freshCustomer.tax_id} → ${taxId} (no status/ai change)`);
    return;
  }
  if (taxId) {
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      tax_id: taxId, ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    const enrichedTax = await runHandoverExtract(supabase, { ...freshCustomer, tax_id: taxId }, cfg, "tax_id");
    const summary = buildCustomerSummary(enrichedTax, cfg);
    const intro = renderTemplate(cfg.handover_intro_tax || `รับทราบค่ะ ได้รับข้อมูลเลขผู้เสียภาษี/Tag {tax_id} เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏`, { tax_id: taxId });
    const msg = [intro, "", ...summary].join("\n");
    await sendAndSave(supabase, customer.id, lineUserId, msg);
    return;
  }
  // AI ถามเบอร์อยู่ แต่ลูกค้าตอบเลขยาวเกินไป → ขอเบอร์ใหม่ (ห้ามตกไปเป็น tax)
  if (phoneTypo) {
    await sendAndSave(supabase, customer.id, lineUserId,
      `เลข "${phoneTypo}" ดูยาวเกินไปนะคะ มือถือไทย 10 หลัก ขึ้นต้น 06/08/09 (เช่น 081-234-5678) รบกวนทวนเบอร์ใหม่อีกครั้งค่ะ 🙏`);
    return;
  }
  // AI เพิ่งถาม Tax ID + ลูกค้าตอบเลขมา แต่ไม่ครบ 13 หลัก → ขอใหม่
  if (taxIdMaybe) {
    await sendAndSave(supabase, customer.id, lineUserId,
      `เลข "${taxIdMaybe}" ดูไม่ครบ 13 หลักนะคะ Tax ID ของบริษัทจะมี 13 หลักพอดีค่ะ รบกวนทวนใหม่อีกครั้งนะคะ 🙏`);
    return;
  }


  // Phone detection — collect ALL candidates (ข้าม run ที่ยาว 13 หลักเพื่อกัน Tax ID)
  const pureDigits = messageText.replace(/[\s\-().+]/g, "");
  const isPure = /^\d+$/.test(pureDigits);
  // ❌ ข้าม sequence ที่มีจุด "." คั่น (เช่น "9.00-12.00" = เวลา ไม่ใช่เบอร์)
  // ⚠️ ใช้ space ตัวเดียว (ไม่ใช่ \s) เพื่อกัน newline กิน — ไม่งั้น "084-236-4224\n4. พระ..." จะกลายเป็น 11 หลัก
  const phoneSeqs = (messageText.match(/\d[\d \-().]{6,25}\d/g) || []).filter(s => !s.includes("."));

  // 🕐 ตรวจ context รอบๆ เลข: ถ้ามีคำบอกเวลา/หน่วยอื่น → ไม่ใช่เบอร์
  const nonPhoneContextRe = /(เวลา|โมง|น\.|นาฬิกา|นาที|ชั่วโมง|ชม\.|บาท|ท่าน|คน|กิโล|กก\.|กรัม|เมตร|วัน|เดือน|ปี|ครั้ง)/;
  const hasNonPhoneContext = nonPhoneContextRe.test(messageText);

  const candidates: string[] = [];
  if (isPure && pureDigits.length >= 7 && pureDigits.length <= 12) {
    candidates.push(pureDigits);
  } else {
    // เก็บทุก sequence ที่ดูเหมือนเบอร์ — ถ้ามี context "ท่าน/บาท/น./..." ปนมาด้วย
    // ค่อยกรองด้วย isValidThaiPhone regex (เป๊ะมาก) ทีหลัง
    // เหตุผล: case ลูกค้าส่งข้อมูลรวม (เช่น "เบอร์ 084-xxx, แขก 80 ท่าน") ต้องจับเบอร์ได้
    for (const s of phoneSeqs) {
      const d = s.replace(/[^0-9]/g, "");
      if (d.length >= 7 && d.length <= 12) candidates.push(d);
    }
  }

  // Normalize +66/66 → 0
  const normalized = candidates.map(p => /^66\d{8,9}$/.test(p) ? "0" + p.slice(2) : p);

  // เบอร์ไทย valid:
  //   มือถือ 10 หลัก ขึ้นต้น 06/08/09  |  เบอร์บ้าน 9 หลัก ขึ้นต้น 02-07
  const isValidThaiPhone = (p: string) => /^0[689]\d{8}$/.test(p) || /^0[2-7]\d{7}$/.test(p);
  // 🚫 กันเบอร์บริษัท: filter ด้วย app_settings.company_phones (blacklist ทั่วบริษัท)
  const companyPhonesRaw = Array.isArray((cfg as any)?.company_phones) ? (cfg as any).company_phones : [];
  const companyPhonesSet = new Set<string>(
    companyPhonesRaw.map((x: any) => String(x || "").replace(/\D/g, "")).filter((x: string) => x.length >= 9)
  );
  const validPhones = Array.from(new Set(normalized.filter(isValidThaiPhone))).filter(p => !companyPhonesSet.has(p));
  const droppedCompanyPhones = Array.from(new Set(normalized.filter(isValidThaiPhone))).filter(p => companyPhonesSet.has(p));
  if (droppedCompanyPhones.length > 0) {
    console.log(`[company-phones] dropped from customer save: ${droppedCompanyPhones.join(",")}`);
  }

  // Invalid phone-like: ถามใหม่ ก็ต่อเมื่อ AI เพิ่งถามเบอร์ + ข้อความสั้นและดูเหมือนตั้งใจให้เบอร์
  const nonDigit = messageText.replace(/[0-9\s\-().+]/g, "").trim();
  const looksLikePhoneIntent = aiAskedPhone && nonDigit.length <= 40 && !hasNonPhoneContext;
  const invalidPhones = (validPhones.length === 0 && looksLikePhoneIntent)
    ? normalized.filter(p => !isValidThaiPhone(p) && /^0?\d{7,10}$/.test(p))
    : [];
  

  // helper: strip company phones from an existing customer.phone string (กัน data ที่ปนมาจากก่อนแก้)
  const stripCompany = (raw: string) => String(raw || "")
    .split(/[,\s]+/)
    .map(p => p.replace(/\D/g, ""))
    .filter(p => p && !companyPhonesSet.has(p));

  // 🛡️ ลูกค้าสถานะปกป้อง (confirmed/postponed) ส่งเบอร์ใหม่ → save แบบไม่แตะ status/ai
  if (validPhones.length > 0 && isProtectedStatus(freshCustomer.status)) {
    const existingClean = stripCompany(freshCustomer.phone || "");
    const existingNorm = new Set(existingClean);
    const newOnes = validPhones.filter(p => !existingNorm.has(p));
    if (newOnes.length === 0) {
      console.log(`[Protected] same phone(s) — silent skip`);
      return;
    }
    const mergedPhones = Array.from(new Set([...existingClean, ...validPhones])).join(", ");
    await supabase.from("customers").update({ phone: mergedPhones }).eq("id", customer.id);
    await supabase.from("conversations").insert({
      customer_id: customer.id, sender: "system",
      message: `🔔 ลูกค้าส่งเบอร์ใหม่\nเก่า: ${freshCustomer.phone || "—"}\nใหม่: ${newOnes.join(", ")}`,
    });
    console.log(`[Protected] phone added ${newOnes.join(",")} (no status/ai change)`);
    return;
  }
  if (validPhones.length > 0) {
    const fmtOne = (p: string) => /^0[689]\d{8}$/.test(p)
      ? p.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
      : p.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
    // Save ALL valid phones (comma-separated). Merge with existing if any.
    const existingPhones = (freshCustomer.phone || "").split(/[,\s]+/).filter(isValidThaiPhone).filter(p => !companyPhonesSet.has(p));
    const allPhones = Array.from(new Set([...existingPhones, ...validPhones]));
    const phoneStr = allPhones.join(", ");
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      phone: phoneStr, phone_saved_at: new Date().toISOString(), ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    const fmtList = validPhones.map(fmtOne);
    const fmtStr = fmtList.length === 1 ? fmtList[0] : fmtList.join(", ");
    const enriched = await runHandoverExtract(supabase, { ...freshCustomer, phone: phoneStr }, cfg, "phone");
    const summary = buildCustomerSummary({ ...enriched, phone: fmtStr }, cfg);
    const introTpl = cfg.handover_intro_phone || `ขอบคุณสำหรับข้อมูลค่ะ บันทึกเบอร์โทร {phone} เรียบร้อยแล้ว\n\nจะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยนะคะ`;
    const intro = renderTemplate(introTpl, { phone: fmtStr, phone_count: String(validPhones.length) });

    await sendAndSave(supabase, customer.id, lineUserId, [intro, "", ...summary].join("\n"));
    return;
  }

  // Invalid phone-like: ไม่เก็บ + ถามนุ่มๆ (เฉพาะตอน AI ถามเบอร์ + ไม่มี context เวลา/หน่วย)
  if (invalidPhones.length > 0) {
    const bad = invalidPhones[0];
    const text = `ขอเบอร์อีกครั้งได้ไหมคะ เบอร์ที่ให้มา "${bad}" ดูไม่ตรงรูปแบบเบอร์ไทยค่ะ 🙏\n\n• มือถือ 10 หลัก ขึ้นต้น 06/08/09 (เช่น 081-234-5678)\n• เบอร์บ้าน 9 หลัก ขึ้นต้น 02-07 (เช่น 02-123-4567)`;
    await sendAndSave(supabase, customer.id, lineUserId, text);
    return;
  }


  // (Whitelist + ai_enabled gates ย้ายไปอยู่บนสุดแล้ว — ดู block "Whitelist" หลังโหลด cfg)


  // (Post-phone reply cap removed — ลูกค้าเก่าที่มีเบอร์แล้วกลับมาทักใหม่ AI ตอบต่อได้ปกติ
  //  ระบบ returning-customer awareness (ใน buildPrompt) จะรู้ว่าเป็นลูกค้าเก่าและปรับโทนให้เอง
  //  ถ้า AI ไม่มั่นใจจะ trigger auto-handover (low confidence) อยู่แล้ว)

  // (Schedule gate ย้ายไปอยู่บนสุดแล้ว — ดู block "Schedule gate" หลังโหลด cfg)


  // Fetch AI context + cache + total message count
  const [
    { data: recentConvs },
    { data: kb },
    { data: pkgs },
    { data: promos },
    { data: cacheRows },
    { count: totalMsgCount },
  ] = await Promise.all([
    supabase.from("conversations").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("knowledge_base").select("*").eq("status", "active").order("sort_order", { ascending: true }),
    supabase.from("catering_packages").select("*").eq("is_active", true),
    supabase.from("promotions").select("*").eq("is_active", true),
    supabase.from("ai_context_cache").select("key, content"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("customer_id", customer.id),
  ]);

  // (post-quote ack guard ย้ายขึ้นไปก่อน trivial-skip แล้ว — ดู block ด้านบน)



  const cooldownMs = (cfg.cooldown_minutes || 1) * 60 * 1000;
  const lastAdmin = [...(recentConvs || [])].reverse().find((m: any) => m.sender === "admin");
  if (lastAdmin && Date.now() - new Date(lastAdmin.created_at).getTime() < cooldownMs) return;



  // Trigger summarization (async, ไม่บล็อก) ถ้าข้อความเกิน 20
  if ((totalMsgCount || 0) >= 20) {
    triggerSummarize(customer.id);
  }

  // ─── Patch 2.2 — early service_scope resolve for retrieval filtering ──────
  // resolveServiceScope() เป็น pure/deterministic → เรียกซ้ำได้ (persist ตอนหลัง)
  const _earlyIntent: any = (freshCustomer.intent_data && typeof freshCustomer.intent_data === "object") ? freshCustomer.intent_data : {};
  const _earlyCurrentScope: ServiceScope | null = (_earlyIntent.service_scope === "food_only_buffet" || _earlyIntent.service_scope === "full_merit_package")
    ? _earlyIntent.service_scope
    : null;
  const _earlyScopeForRetrieval: ServiceScope = resolveServiceScope(_earlyCurrentScope, messageText).scope;

  // === Hybrid filter: ถ้ารู้ event_type → กรอง pkg/promo ที่ตรง category, ไม่งั้นส่งทั้งหมด ===
  const evType = (freshCustomer.event_type || "").trim().toLowerCase();

  // token-overlap match: split ทั้งสองฝั่งด้วย + / space / , แล้วเช็กว่ามี token ไหน substring overlap กัน
  const tokenize = (s: string) => s.toLowerCase().split(/[\s+,/]+/).map(t => t.trim()).filter(t => t.length >= 2);
  const filterMatch = (cat: string | null | undefined) => {
    if (!evType) return true;
    if (!cat) return false;
    const c = String(cat).toLowerCase();
    if (c.includes(evType) || evType.includes(c)) return true;
    const evTokens = tokenize(evType);
    const catTokens = tokenize(c);
    return evTokens.some(et => catTokens.some(ct => et.includes(ct) || ct.includes(et)));
  };
  const filteredPkgs = evType
    ? (pkgs || []).filter((p: any) => filterMatch(p.category))
    : (pkgs || []);
  // ถ้ากรองแล้วเหลือ 0 → fallback ส่งทั้งหมด (กันพลาด)
  let usePkgs = filteredPkgs.length > 0 ? filteredPkgs : (pkgs || []);
  // Patch 2.4 — scope-filter packages bypass evType filter (food-only pkgs live in different category)
  if (_earlyScopeForRetrieval === "food_only_buffet") {
    const source = pkgs || [];
    const before = source.length;
    usePkgs = filterPackagesByScope(source, _earlyScopeForRetrieval);
    if (usePkgs.length === 0) {
      console.log(`[ServiceScope] package filter (bypass evType) empty for scope=food_only_buffet — no fallback (source=${before})`);
    } else {
      console.log(`[ServiceScope] package filter (bypass evType) scope=food_only_buffet source=${before} after=${usePkgs.length}`);
    }
  }

  const filteredPromos = evType
    ? (promos || []).filter((pr: any) => !pr.applicable_categories?.length || pr.applicable_categories.some((c: string) => filterMatch(c)))
    : (promos || []);
  // ✅ fallback: ถ้ากรองแล้วเหลือ 0 → ส่งโปรทั้งหมดให้ AI ตัดสินใจเอง (กันพลาด)
  const usePromos = filteredPromos.length > 0 ? filteredPromos : (promos || []);

  // === KB / Package / Promo context: ใช้ cache ถ้าไม่มี filter, ไม่งั้น build ใหม่ ===
  const cacheMap = new Map<string, string>((cacheRows || []).map((r: any) => [r.key, r.content]));
  const kbItems = kb || [];
  const kbWithImages = kbItems.filter((i: any) => getItemImages(i).length > 0);
  const kbWithVideos = kbItems.filter((i: any) => getItemVideos(i).length > 0);

  // เตรียม history string ก่อน เพื่อใช้ใน filterRelevantKB
  let historyForFilter = [...(recentConvs || [])].reverse();
  const _lastAdminIdxF = historyForFilter.map((m, i) => m.sender === "admin" ? i : -1).filter(i => i >= 0).pop();
  if (_lastAdminIdxF !== undefined) historyForFilter = historyForFilter.slice(_lastAdminIdxF);
  else historyForFilter = historyForFilter.slice(-6);
  const recentMsgsForFilter = historyForFilter.map((m: any) => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`).join("\n");

  // KB retrieval: ลอง semantic search ก่อน (เข้าใจความหมายภาษาไทย), fallback เป็น keyword ถ้าพลาด
  const mustIncludeIds = kbItems.filter((i: any) => i?.is_always_include).map((i: any) => i.id);
  let filteredKb: any[] = [];
  try {
    const queryText = `${messageText}\n${recentMsgsForFilter}`.slice(0, 4000);
    const embedRes = await fetch(`${SUPABASE_URL}/functions/v1/embed-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ text: queryText }),
    });
    if (embedRes.ok) {
      const { embedding } = await embedRes.json();
      const { data: matches } = await supabase.rpc("match_knowledge_base", {
        query_embedding: embedding,
        match_count: 8,
        min_similarity: 0.3,
      });
      if (matches && matches.length > 0) {
        const mustSet = new Set(mustIncludeIds);
        const must = kbItems.filter((i: any) => mustSet.has(i.id));
        const sorted = matches
          .map((m: any) => kbItems.find((i: any) => i.id === m.id))
          .filter(Boolean)
          .filter((i: any) => !mustSet.has(i.id));
        filteredKb = [...must, ...sorted];
        console.log(`[KB semantic] matched ${matches.length} items, top sim=${matches[0]?.similarity?.toFixed(3)}`);
      }
    } else {
      console.warn(`[KB semantic] embed failed ${embedRes.status}, fallback to keyword`);
    }
  } catch (e) {
    console.warn(`[KB semantic] error, fallback to keyword:`, e);
  }
  if (filteredKb.length === 0) {
    filteredKb = filterRelevantKB(kbItems, messageText, recentMsgsForFilter, 8, mustIncludeIds);
  }
  // Patch 2.2 — scope-filter KB (deny ceremony categories when food_only_buffet)
  if (_earlyScopeForRetrieval === "food_only_buffet") {
    const beforeKb = filteredKb.length;
    filteredKb = filterKbByScope(filteredKb, _earlyScopeForRetrieval);
    console.log(`[ServiceScope] KB filter scope=food_only_buffet before=${beforeKb} after=${filteredKb.length}`);
  }
  let kbContext = buildKbBlock(filteredKb);
  kbContext = truncateToTokens(kbContext, BUDGET_KB);

  // Package: ถ้ามี filter → build ใหม่จาก usePkgs, ไม่งั้นใช้ cache
  // Patch 2.2: bypass cache เมื่อ scope=food_only_buffet (cache เป็น full list)
  const pkgsWithImages = usePkgs.filter((p: any) => p.image_urls?.length > 0);
  const pkgsWithVideos = usePkgs.filter((p: any) => getItemVideos(p).length > 0);
  const _bypassPkgCache = _earlyScopeForRetrieval === "food_only_buffet";
  let pkgContext = ((evType && filteredPkgs.length > 0) || _bypassPkgCache)
    ? buildPackageBlock(usePkgs)
    : (cacheMap.get("packages_summary") || buildPackageBlock(usePkgs));
  pkgContext = truncateToTokens(pkgContext, BUDGET_PACKAGES);


  const promosWithImages = usePromos.filter((pr: any) => pr.image_urls?.length > 0);
  const promosWithVideos = usePromos.filter((pr: any) => getItemVideos(pr).length > 0);
  let promoContext = evType
    ? buildPromoBlock(usePromos)
    : (cacheMap.get("promotions_summary") || buildPromoBlock(usePromos));
  promoContext = truncateToTokens(promoContext, BUDGET_PROMOS);

  // Tier-level images (ใช้ usePkgs ที่ filter แล้ว)
  const tierImageRefs: { title: string; url: string }[] = [];
  for (const p of usePkgs) {
    for (const t of (p.pricing_tiers || [])) {
      if (t.image_url && t.tier_name) {
        tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name}`, url: t.image_url });
      }
      if (Array.isArray(t.quality_levels)) {
        for (const q of t.quality_levels) {
          if (q?.image_url && q?.name && t.tier_name) {
            tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name} — ${q.name}`, url: q.image_url });
          }
        }
      }
    }
  }



  const allImageSources = [
    ...kbWithImages.map((i: any) => `"${i.title}"`),
    ...pkgsWithImages.map((p: any) => `"แพ็กเกจ: ${p.name}" (รูปรวม/เปรียบเทียบ)`),
    ...tierImageRefs.map((t) => `"${t.title}" (รูปเฉพาะ tier)`),
    ...promosWithImages.map((pr: any) => `"โปรโมชั่น: ${pr.name}"`),
    ...kbWithVideos.map((i: any) => `"VDO: ${i.title}"`),
    ...pkgsWithVideos.map((p: any) => `"VDO แพ็กเกจ: ${p.name}"`),
    ...promosWithVideos.map((pr: any) => `"VDO โปรโมชั่น: ${pr.name}"`),
  ];
  // Patch 2.8.1 — proposal-only image whitelist (package + tier เท่านั้น, ตัด KB/promotion/video)
  const proposalPackageImageSources = [
    ...pkgsWithImages.map((p: any) => `"แพ็กเกจ: ${p.name}" (รูปรวม/เปรียบเทียบ)`),
    ...tierImageRefs.map((t) => `"${t.title}" (รูปเฉพาะ tier)`),
  ];
  const imageListStr = allImageSources.length ? `\n\n📸 รายชื่อรูป/วิดีโอที่ส่งได้ (ใส่ใน image_titles ตรงตามนี้สูงสุด 4 รายการ ตรงตามกฎเลือกสื่อใน strict_rules):\n${allImageSources.join("\n")}` : "";


  // กลยุทธ์ส่งรูปเปรียบเทียบ (Phase 1) — น้ำเสียงตั้งค่าได้ใน Settings (comparison_instruction)
  const comparisonInstruction = (cfg.comparison_instruction || "").trim();
  const phase2Instruction = (cfg.phase2_instruction || "").trim();
  const prevSentTitles = Array.isArray(customer.last_sent_image_titles) ? customer.last_sent_image_titles : [];
  const prevSentStr = prevSentTitles.length ? `\n\n🚫 รูปที่เคยส่งให้ลูกค้าคนนี้ไปแล้วในรอบก่อนหน้า (ห้ามส่งซ้ำ เว้นแต่ลูกค้าขอใหม่ชัดเจน):\n${prevSentTitles.map((t: string) => `- ${t}`).join("\n")}` : "";
  const phase2Block = phase2Instruction ? `\nPhase 2 (ลูกค้าเลือกระดับ/บอกงบ/เลือกประเภทแพ็กแล้ว): ${phase2Instruction}` : `\nPhase 2: ส่งเฉพาะรูป tier ที่แนะนำเท่านั้น ห้ามแนบ KB เมนู/รูปอื่น เว้นแต่ลูกค้าจะขอดูเมนูชัดเจน`;
  const comparisonSection = (cfg.comparison_phase_enabled && cfg.comparison_kb_category)
    ? `\n\n🎯 กลยุทธ์ส่งรูปเปรียบเทียบ 2 จังหวะ:\nPhase 1 (ลูกค้ายังไม่ระบุระดับ/งบ): เมื่อลูกค้าถามราคา/แพ็กเกจ/มีอะไรบ้าง โดยยังไม่บอกงบหรือเลือกระดับ → ใส่ image_titles เป็นรายการ KB หมวด "${cfg.comparison_kb_category}" ที่ตรงจำนวนคน\n  • ถ้าไม่มี KB หมวดนี้ที่ตรง หรือคุณกำลังเสนอ tier เฉพาะเจาะจง (เช่น "แพ็ก 30 ท่าน ราคา X") → ใส่ image_titles เป็น "แพ็กเกจ: ชื่อ — tier" ของ tier ที่เสนอ 1 อันได้\n  • ❌ ห้ามแนบ KB เมนู/ตัวอย่าง/ซุ้ม เด็ดขาดใน Phase 1 เว้นแต่ลูกค้าจะ "ขอดูเมนู/ขอดูตัวอย่าง" ชัดเจนในข้อความล่าสุด${phase2Block}\nถ้าลูกค้ายังไม่บอกจำนวนคน → ถามจำนวนคนก่อน ยังไม่ต้องส่งรูป${comparisonInstruction ? `\n\n📣 น้ำเสียงตอนส่งรูปเปรียบเทียบ (จาก Settings):\n${comparisonInstruction}` : ""}${prevSentStr}`
    : (phase2Instruction ? `\n\n🎯 กฎเลือกรูปเมื่อลูกค้าเลือกแพ็ก/ระดับแล้ว:\n${phase2Instruction}${prevSentStr}` : prevSentStr);

  let history = [...(recentConvs || [])].reverse();
  const lastAdminIdx = history.map((m, i) => m.sender === "admin" ? i : -1).filter(i => i >= 0).pop();
  if (lastAdminIdx !== undefined) history = history.slice(lastAdminIdx);
  else history = history.slice(-6);
  let recentMsgs = history.map((m: any) => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`).join("\n");
  recentMsgs = truncateToTokens(recentMsgs, BUDGET_HISTORY);

  // นับรอบสนทนา = จำนวนข้อความลูกค้าใน history (รวมข้อความปัจจุบัน)
  const customerTurns = history.filter((m: any) => m.sender === "customer").length;

  // Conversation summary (ถ้ามี) — สรุปข้อความก่อนหน้าที่ตัดออกจาก history
  const convSummary = (freshCustomer.conversation_summary || "").trim();
  const summarySection = convSummary ? `\n\n📋 สรุปบทสนทนาก่อนหน้า:\n${convSummary}` : "";

  // ข้อมูล intent ที่มีอยู่แล้ว
  const knownIntent: string[] = [];
  if (freshCustomer.event_type) knownIntent.push(`ประเภทงาน: ${freshCustomer.event_type}`);
  if (freshCustomer.venue) knownIntent.push(`สถานที่: ${freshCustomer.venue}`);
  if (freshCustomer.guest_count) knownIntent.push(`จำนวนคน: ${freshCustomer.guest_count}`);
  if (freshCustomer.event_date) knownIntent.push(`วันจัดงาน: ${freshCustomer.event_date}`);

  // 🧩 Configurable intent fields (จาก app_settings.intent_fields) — admin ตั้งเองได้
  const intentFields: any[] = Array.isArray(cfg.intent_fields) ? cfg.intent_fields.filter((f: any) => f?.key && f?.label) : [];
  const customerIntentData: Record<string, any> = (freshCustomer.intent_data && typeof freshCustomer.intent_data === "object") ? freshCustomer.intent_data : {};

  // ─── Patch 2.1 — service_scope drift guard ──────────────────────────────
  // Resolve service_scope deterministically จาก latest message + current stored value
  // Sticky rule: เมื่อ food_only_buffet แล้ว → คงไว้ ยกเว้นลูกค้าประกาศ switch ชัดเจน
  // Persist ก่อน AI call เพื่อให้ turn เดียวกัน inject ลง prompt ได้ทันที
  const currentScope: ServiceScope | null = (customerIntentData.service_scope === "food_only_buffet"
    || customerIntentData.service_scope === "full_merit_package")
    ? customerIntentData.service_scope
    : null;
  const scopeResult = resolveServiceScope(currentScope, messageText);
  if (scopeResult.changed && scopeResult.scope) {
    const mergedScope = { ...customerIntentData, service_scope: scopeResult.scope };
    await supabase.from("customers").update({ intent_data: mergedScope }).eq("id", freshCustomer.id);
    customerIntentData.service_scope = scopeResult.scope;
    (freshCustomer as any).intent_data = mergedScope;
    console.log(`[ServiceScope] persisted scope=${scopeResult.scope} reason="${scopeResult.reason}" customer=${freshCustomer.id}`);
  } else if (scopeResult.scope) {
    console.log(`[ServiceScope] sticky scope=${scopeResult.scope} reason="${scopeResult.reason}"`);
  }
  const activeScope: ServiceScope = scopeResult.scope;

  const intentFieldInstructions: string[] = [];
  const missingRequiredLabels: string[] = [];
  for (const f of intentFields) {
    const val = customerIntentData[f.key];
    if (val !== undefined && val !== null && String(val).trim()) {
      knownIntent.push(`${f.label}: ${val}`);
      if (f.instruction) intentFieldInstructions.push(`✅ รู้ ${f.label} แล้ว (= "${val}") → ${f.instruction}`);
    } else if (f.required) {
      missingRequiredLabels.push(f.label);
    }
  }

  let knownIntentStr = knownIntent.length ? `\n\n📋 ข้อมูลลูกค้าที่เก็บไว้แล้ว:\n${knownIntent.join("\n")}` : "";

  // Patch 2.1 — inject SERVICE_SCOPE_LOCK ทุก turn เมื่อ scope ถูก set แล้ว
  const scopeLockPrompt = buildServiceScopeLockPrompt(activeScope);
  if (scopeLockPrompt) knownIntentStr += scopeLockPrompt;

  // 📍 Venue location (จาก LINE location หรือ Google Maps URL) + ระยะทางจากร้าน (ถ้ามี)
  const vloc = customerIntentData.venue_location;
  if (vloc && typeof vloc === "object" && Number.isFinite(vloc.lat) && Number.isFinite(vloc.lng)) {
    const parts: string[] = [];
    if (vloc.title) parts.push(`ชื่อสถานที่: ${vloc.title}`);
    if (vloc.address) parts.push(`ที่อยู่: ${vloc.address}`);
    parts.push(`พิกัด: ${vloc.lat},${vloc.lng}`);
    if (Number.isFinite(vloc.distance_km) && Number.isFinite(vloc.duration_min)) {
      parts.push(`📏 ระยะทางจากร้าน: ${vloc.distance_km} กม. (~${vloc.duration_min} นาที โดยรถยนต์)`);
    }
    knownIntentStr += `\n\n📍 พิกัดสถานที่จัดงานที่ลูกค้าแชร์มา:\n${parts.join("\n")}\n⚠️ ใช้ข้อมูลนี้ตอบเรื่องสถานที่ได้ แต่ห้ามแต่งราคาค่าเดินทางเอง — ถ้าลูกค้าถามค่าเดินทาง ให้บอกว่า "ทีมงานจะเช็กแล้วแจ้งกลับนะคะ"`;
  }

  // คำสั่งสำหรับ field ที่ admin กำหนด + field ที่ยังขาด
  if (intentFields.length > 0) {
    const fieldDescs = intentFields.map((f: any) => {
      const valuesHint = Array.isArray(f.values) && f.values.length > 0 ? ` (ค่าที่อนุญาต: ${f.values.join(" / ")})` : "";
      const reqHint = f.required ? " [จำเป็น]" : "";
      return `  - "${f.key}" = ${f.label}${valuesHint}${reqHint}`;
    }).join("\n");
    knownIntentStr += `\n\n🎯 ข้อมูลพิเศษที่ต้องสกัดและส่งคืนใน "extra_intent_json" (JSON string):\n${fieldDescs}\n⚠️ ใส่เฉพาะ key ในรายการนี้เท่านั้น ห้ามใส่ key อื่น ห้ามแต่งค่า ถ้าไม่แน่ใจให้ละไว้`;
  }
  if (intentFieldInstructions.length > 0) {
    knownIntentStr += `\n\n📌 กฎจากข้อมูลที่รู้แล้ว (สำคัญ):\n${intentFieldInstructions.join("\n")}`;
  }
  if (missingRequiredLabels.length > 0) {
    knownIntentStr += `\n\n❓ ยังไม่ทราบข้อมูลสำคัญ: ${missingRequiredLabels.join(", ")} — ถามทีละข้อในจังหวะที่เหมาะสม`;
  }

  // 🔢 ตรวจจำนวนแขกจากข้อความ + ที่เก็บไว้ — ถ้า max <40 → เพิ่ม alert กฎห้ามเสนอโต๊ะจีน/ซุ้ม/ภาพรวม
  const guestNumsInText = Array.from(String(messageText).matchAll(/(\d{1,4})\s*(?:ท่าน|คน|พระ|แขก)/g)).map(m => parseInt(m[1], 10)).filter(n => n > 0 && n < 1000);
  const allGuestNums = [...guestNumsInText, freshCustomer.guest_count].filter((n): n is number => typeof n === "number" && n > 0);
  const maxGuest = allGuestNums.length ? Math.max(...allGuestNums) : 0;
  const isSmallGroup = maxGuest > 0 && maxGuest < 40;
  if (isSmallGroup) {
    knownIntentStr += `\n\n🚨🚨 ALERT: ลูกค้าจำนวน ${maxGuest} ท่าน (<40) — ห้ามเสนอ/พูดถึง "โต๊ะจีน" "ซุ้มอาหาร" "ภาพรวม" เด็ดขาด | เสนอเฉพาะบุฟเฟ่ต์ | image_titles ห้ามมีคำว่า ภาพรวม/โต๊ะจีน/ซุ้ม/เปรียบเทียบ`;
  }

  // ─── Patch 2.8 — New-customer full-service package proposal guard ─────────
  // ปิด gap ที่ AI ถาม "ชอบแบบไหน" ก่อนเสนอแพ็ก + ไม่ใส่ image_titles ทั้งที่มีรูปใน context
  // Runtime data only — ไม่ hardcode ชื่อแพ็ก/ราคา/tier/รูป
  try {
    const _proposalGuard = buildNewCustomerProposalGuardBlock({
      activeScope,
      customerStatus: freshCustomer?.status ?? null,
      eventType: freshCustomer?.event_type ?? null,
      guestCount: (freshCustomer as any)?.guest_count ?? null,
      packageNames: (usePkgs || []).map((p: any) => (p?.name || "").toString().trim()).filter(Boolean),
      availableImageTitles: proposalPackageImageSources,
      prevSentImageCount: Array.isArray((customer as any)?.last_sent_image_titles)
        ? (customer as any).last_sent_image_titles.length
        : 0,
    });
    if (_proposalGuard.triggered) {
      knownIntentStr += _proposalGuard.block;
      console.log(`[ProposalGuard:2.8] triggered — ${_proposalGuard.reason}`);
    } else {
      console.log(`[ProposalGuard:2.8] skipped — ${_proposalGuard.reason}`);
    }
  } catch (e: any) {
    console.warn("[ProposalGuard:2.8] error (ignored):", e?.message);
  }

  // 🗺️ Service area guard — บังคับ inject KB whitelist จังหวัด ถ้าลูกค้าพูดถึงสถานที่/จังหวัด
  // ใช้ค่าจาก app_settings (service_area_kb_title + location_keywords) เพื่อให้แอดมินแก้ได้
  const serviceAreaTitle = String(cfg.service_area_kb_title || "").trim();
  const locKeywords: string[] = Array.isArray(cfg.location_keywords) ? cfg.location_keywords.filter((s: any) => typeof s === "string" && s.trim()) : [];
  const serviceAreaKb = serviceAreaTitle ? kbItems.find((k: any) => String(k.title || "").trim() === serviceAreaTitle) : null;
  const mentionsLocation = locKeywords.some(kw => String(messageText).includes(kw));
  if (serviceAreaKb && (mentionsLocation || freshCustomer.venue)) {
    knownIntentStr += `\n\n🗺️ พื้นที่ให้บริการ (whitelist — ต้องเช็กก่อนตอบเรื่องค่าเดินทาง/ระยะทาง):\n${serviceAreaKb.content}\n\n⚠️ ถ้าจังหวัดที่ลูกค้าพูดไม่อยู่ใน whitelist ด้านบน → ตอบว่า "พื้นที่นี้ยังไม่ได้ให้บริการประจำค่ะ เดี๋ยวให้ทีมงานเช็กความเป็นไปได้และค่าใช้จ่ายเพิ่มเติมแล้วแจ้งกลับนะคะ" — **ห้ามแต่งราคาค่าเดินทาง/ระยะทาง/ค่าขนส่งใดๆ ห้ามรับปากว่าไปได้** ห้ามขอโลเคชั่นเพื่อเช็กราคาเอง`;
  }

  const hasPhone = !!freshCustomer.phone;
  const fmtPhone = hasPhone ? freshCustomer.phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : "";

  // ===== บริบทลูกค้าเก่า (อิงสถานะ + แท็ก + ประวัติงาน — ไม่มี Lifecycle อัตโนมัติแล้ว) =====
  const custName = (freshCustomer.nickname || freshCustomer.display_name || "").toString().trim();
  const hasPastEvent = pastEvents.length > 0;

  let customerContextSection = "";
  if (hasPastEvent) {
    const pastLines = pastEvents.map((e: any) => {
      const parts = [
        e.event_type || "(งาน)",
        e.guest_count ? `${e.guest_count} ท่าน` : "",
        e.event_date || "",
        e.venue || "",
        e.package_name ? `แพ็ก: ${e.package_name}` : "",
        Number(e.total_amount) > 0 ? `ยอด ${Number(e.total_amount).toLocaleString()} บ.` : "",
      ].filter(Boolean);
      return `  • ${parts.join(" | ")}`;
    }).join("\n");

    customerContextSection = `

🟢 ลูกค้ารายนี้เคยใช้บริการมาก่อน${custName ? ` (คุณ${custName})` : ""} — ห้ามทักทายเหมือนลูกค้าใหม่ ห้ามถามข้อมูลซ้ำที่เคยรู้ อ้างถึงงานเก่าได้
- ประวัติงานที่เคยจัด:
${pastLines}
`;
  }

  // 🟡 ลูกค้าเลื่อนวันจัดงาน (มัดจำแล้ว) — ห้ามคุยเหมือนลูกค้าใหม่
  if (freshCustomer.status === "postponed") {
    customerContextSection += `

🟡 ลูกค้ารายนี้**เคยจองและวางมัดจำกับเราแล้ว** แต่ต้องเลื่อนวันจัดงาน (เหตุสุดวิสัย/ภัยธรรมชาติ/เหตุจำเป็น) ตอนนี้รอกลับมาจัดงานใหม่
กฎสำคัญ (ห้ามผิดเด็ดขาด):
- ห้ามทักทาย/ถามเหมือนลูกค้าใหม่ ห้ามถามชื่อ/เบอร์/ประเภทงานซ้ำที่เคยรู้แล้ว
- ทักทายแบบรู้จักกันอยู่แล้ว เช่น "สวัสดีค่ะ${custName ? ` คุณ${custName}` : ""} ได้ข่าวว่าจะกลับมาจัดงานแล้วใช่ไหมคะ?"
- **ห้ามถามเรื่องมัดจำซ้ำ ห้ามขอมัดจำใหม่** — เรารับมัดจำไว้แล้ว
- ถ้าลูกค้าบอกวันใหม่/รายละเอียดใหม่ → รับเรื่อง แล้วบอกว่า "เดี๋ยวเจ้าหน้าที่ติดต่อกลับเพื่อยืนยันรายละเอียดนะคะ"
- ห้ามเสนอราคาใหม่/โปรใหม่จนกว่าลูกค้าจะถาม — โฟกัสที่การยืนยันวันจัดงานใหม่ก่อน
`;
  }

  const returningPrompt = customerContextSection + (hasPhone ? `

🔵 ลูกค้ารายนี้เคยให้เบอร์โทรไว้แล้ว: ${fmtPhone}
กฎ:
- ตอบคำถามตามปกติก่อน
- พยายามเก็บข้อมูลเพิ่ม: ประเภทงาน, จำนวนคน, สถานที่/จังหวัด (ทีละเรื่อง)
- ได้ข้อมูล 2+ → ถาม "ให้เจ้าหน้าที่ติดต่อกลับที่เบอร์ ${fmtPhone} เลยได้ไหมครับ?"
- สนทนาครบ 3 รอบยังไม่ได้ข้อมูล → ถามยืนยันเบอร์เลย
- ลูกค้ายืนยัน (ได้/ได้เลย/ค่ะ/ครับ/OK) → set confirm_existing_phone: true` : "");

  // 🏷️ ดึงคำสั่ง AI ของแท็กที่ลูกค้าคนนี้มี (ถ้ามี) — fail-safe ถ้าพังให้ใช้ string ว่าง
  let tagInstructions = "";
  try {
    const custTags: string[] = Array.isArray(customer.tags) ? customer.tags.filter((x: any) => typeof x === "string" && x.trim()) : [];
    if (custTags.length) {
      const { data: tagRows } = await supabase
        .from("tags")
        .select("name, ai_tag_instructions")
        .in("name", custTags)
        .not("ai_tag_instructions", "is", null);
      if (tagRows?.length) {
        tagInstructions = tagRows
          .filter((t: any) => t.ai_tag_instructions && String(t.ai_tag_instructions).trim())
          .map((t: any) => `- [${t.name}] ${String(t.ai_tag_instructions).trim()}`)
          .join("\n");
      }
    }
  } catch (e: any) {
    console.warn("[tags] fetch ai_tag_instructions failed:", e?.message);
  }

  // 📝 รวม customer_notes (สอนโดยแอดมิน ฝังเฉพาะลูกค้ารายนี้)
  let customerNotes = "";
  try {
    const notesArr: any[] = Array.isArray((customer as any).customer_notes) ? (customer as any).customer_notes : [];
    if (notesArr.length) {
      customerNotes = notesArr
        .filter((n: any) => n && (n.q || n.a))
        .map((n: any) => `- ${n.q ? `ถาม: ${String(n.q).trim()} → ` : ""}${String(n.a || "").trim()}`)
        .join("\n");
    }
  } catch (e: any) {
    console.warn("[customer_notes] parse failed:", e?.message);
  }

  // 🎯 Phase 2 — resolve lifecycle ONLY for customers listed in ai_policy_config.test_customer_ids.
  //   Fallback-safe: any error → lifecycle/replyMode = undefined → buildPrompt returns
  //   byte-identical baseline prompt. Never blocks the webhook.
  //   Guarantees:
  //     - flag=false                       → block skipped (byte-identical baseline)
  //     - flag=true + test_customer_ids=[] → block skipped (byte-identical baseline)
  //     - flag=true + id ∈ test list       → inject [LIFECYCLE] + [GUARDRAIL] blocks
  let __phase2_policyEnabled: boolean | undefined;
  let __phase2_lifecycle: Lifecycle | undefined;
  let __phase2_replyMode: ReplyMode | undefined;
  let __phase2_customerContextBlock: string | undefined;
  {
    const gate = resolvePhase2Gate({
      customerId: freshCustomer?.id ?? null,
      settings: {
        advanced_ai_status_policy_enabled: cfg?.advanced_ai_status_policy_enabled ?? null,
        ai_policy_config: (cfg as any)?.ai_policy_config ?? null,
      },
    });
    if (gate.enabled) {
      try {
        console.log("[AiPolicy:phase2:gate]", JSON.stringify({
          customer_id: freshCustomer?.id ?? null,
          mode: gate.mode,
          reason: gate.reason,
        }));

        const [evRes, logRes] = await Promise.all([
          supabase
            .from("customer_events")
            .select("event_date")
            .eq("customer_id", freshCustomer.id)
            .eq("status", "completed")
            .not("event_date", "is", null)
            .order("event_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("customer_status_log")
            .select("changed_at")
            .eq("customer_id", freshCustomer.id)
            .eq("new_status", "completed")
            .order("changed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const result = resolveLifecycle({
          customer: {
            status: freshCustomer.status,
            customer_origin: freshCustomer.customer_origin,
            updated_at: (freshCustomer as any).updated_at ?? null,
          },
          latestCompletedEventDate: (evRes as any)?.data?.event_date ?? null,
          latestCompletedStatusChangedAt: (logRes as any)?.data?.changed_at ?? null,
          config: (cfg as any)?.ai_policy_config ?? null,
        });
        __phase2_policyEnabled = true;
        __phase2_lifecycle = result.lifecycle;
        __phase2_replyMode = result.replyMode;

        // Phase 2.1 — build [CURRENT_CUSTOMER_CONTEXT] block (test-customer-only)
        const ctxRes = buildCurrentCustomerContextBlock(
          {
            name: (freshCustomer as any).name ?? null,
            nickname: (freshCustomer as any).nickname ?? null,
            phone: (freshCustomer as any).phone ?? null,
            event_type: (freshCustomer as any).event_type ?? null,
            event_date: (freshCustomer as any).event_date ?? null,
            guest_count: (freshCustomer as any).guest_count ?? null,
            venue: (freshCustomer as any).venue ?? null,
            province: (freshCustomer as any).province ?? null,
            tax_id: (freshCustomer as any).tax_id ?? null,
          },
          customerIntentData,
          result.lifecycle,
        );
        __phase2_customerContextBlock = ctxRes.block || undefined;

        // Patch 2.9 — Confirmed + missing structured context fallback guard.
        // เมื่อ status=confirmed แต่ event_date หรือ venue ยังไม่มีใน structured data,
        // ห้าม AI ถามซ้ำเหมือนลูกค้าใหม่. append เข้า customerContextBlock (ไม่แก้ prompt-builder API).
        try {
          const missingBlock = buildConfirmedMissingContextBlock(result.lifecycle, {
            event_date: (freshCustomer as any).event_date ?? null,
            venue: (freshCustomer as any).venue ?? null,
          });
          if (missingBlock) {
            __phase2_customerContextBlock = __phase2_customerContextBlock
              ? `${__phase2_customerContextBlock}\n\n${missingBlock}`
              : missingBlock;
            console.log("[AiPolicy:phase2.9] confirmed_missing_context injected", {
              customer_id: freshCustomer.id,
              missing: {
                event_date: !(freshCustomer as any).event_date,
                venue: !(freshCustomer as any).venue,
              },
            });
          }
        } catch (e) {
          console.warn("[AiPolicy:phase2.9] buildConfirmedMissingContextBlock error (ignored):", (e as Error)?.message);
        }


        console.log("[AiPolicy:phase2]", JSON.stringify({
          customer_id: freshCustomer.id,
          lifecycle: result.lifecycle,
          replyMode: result.replyMode,
          daysSinceCompletion: result.daysSinceCompletion,
          reason: result.reason,
          contextFields: ctxRes.fieldNames, // keys only — no values (safe to log)
        }));
      } catch (e) {
        console.error("[AiPolicy:phase2] error (ignored, using legacy prompt):", (e as Error)?.message);
        __phase2_policyEnabled = undefined;
        __phase2_lifecycle = undefined;
        __phase2_replyMode = undefined;
        __phase2_customerContextBlock = undefined;
      }
    }
  }


  const { systemPrompt, userPrompt } = buildPrompt({
    cfg,
    kbContext,
    pkgContext,
    promoContext,
    imageListStr,
    recentMsgs,
    messageText,
    customerTurns,
    knownIntentStr,
    summarySection,
    returningPrompt,
    comparisonSection,
    tagInstructions,
    customerNotes,
    customerOrigin: freshCustomer?.customer_origin || "new",
    policyEnabled: __phase2_policyEnabled,
    lifecycle: __phase2_lifecycle,
    replyMode: __phase2_replyMode,
    customerContextBlock: __phase2_customerContextBlock,
  });




  // Log token usage (เพื่อ monitor การประหยัด)
  console.log(`[Tokens] prompt≈${countTokens(systemPrompt) + countTokens(userPrompt)} | kb=${countTokens(kbContext)} pkg=${countTokens(pkgContext)} promo=${countTokens(promoContext)} hist=${countTokens(recentMsgs)} | filter=${evType ? "ON" : "OFF"} cache=${cacheRows?.length || 0}/3`);

  // Helper: ส่งข้อความ "AI ตอบไม่ได้ / ส่งต่อผู้เชี่ยวชาญ" (ถ้าเปิดสวิตช์ไว้)
  const sendUnableToReply = async (reason: string) => {
    if (!cfg.unable_to_reply_enabled) {
      console.log(`[UnableToReply] ${reason} — switch OFF, silent`);
      return;
    }
    const fbText = String(cfg.unable_to_reply_message || "ขอบคุณที่สอบถามนะคะ 🙏 ขอส่งเรื่องให้เจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับโดยเร็วที่สุดค่ะ").trim();
    const muteH = cfg.fallback_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
    await saveAndPushAi(supabase, lineUserId, [{ type: "text", text: fbText }], { customer_id: customer.id, message: fbText, sender: "ai", is_fallback: true });
    await supabase.from("customers").update({
      ai_active: false, manual_chat_until: muteUntil,
      last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${fbText.slice(0, 60)}`,
    }).eq("id", customer.id);
    console.log(`[UnableToReply] ${reason} → sent handover message + mute ${muteH}h`);
  };

  let aiResp: any;
  const _aiStart = Date.now();
  try {
    aiResp = await callAI(systemPrompt, userPrompt, "google/gemini-3-flash-preview");
  } catch (e: any) {
    console.warn(`[LLM] gemini-3-flash failed: ${e.message} — fallback to gemini-2.5-flash`);
    try { aiResp = await callAI(systemPrompt, userPrompt, "google/gemini-2.5-flash"); }
    catch (e2: any) {
      console.error("AI failed:", e2.message);
      logAiAudit(supabase, {
        customer_id: customer.id, line_user_id: lineUserId,
        customer_message: messageText, recent_context: recentMsgs,
        latency_ms: Date.now() - _aiStart, status: "failed", error: String(e2.message || e2),
      });
      await sendUnableToReply(`both LLM models failed: ${e2.message}`);
      return;
    }
  }
  const _aiLatency = Date.now() - _aiStart;
  if (aiResp?._usage) {
    logTokenUsage(supabase, { model: aiResp._model, source: "webhook", apiResponse: { usage: aiResp._usage }, customerId: customer.id });
  }

  // AI ตอบ empty / สั้นผิดปกติ → ส่ง unable_to_reply แทน
  const rawAnswer = String(aiResp?.answer || "").trim();
  if (!rawAnswer || rawAnswer.length < 2) {
    await sendUnableToReply("AI returned empty answer");
    return;
  }

  const confidence = typeof aiResp?.confidence === "number" ? aiResp.confidence : null;

  const answerText = String(aiResp.answer || "ขออภัย ไม่สามารถตอบได้")
    .replace(/\\n/g, "\n").replace(/\\r/g, "")
    .replace(/\n{3,}/g, "\n\n").trim().slice(0, 5000);
  let imageTitles: string[] = aiResp.image_titles || [];

  // 🛡️ Hardcode guard: ลูกค้า <40 ท่าน → กรองรูปที่มีคำต้องห้ามออกเสมอ (AI อาจหลุดกฎ)
  if (isSmallGroup && imageTitles.length > 0) {
    const FORBIDDEN = /ภาพรวม|โต๊ะจีน|ซุ้ม|เปรียบเทียบ/;
    const before = imageTitles.length;
    imageTitles = imageTitles.filter(t => !FORBIDDEN.test(String(t)));
    if (imageTitles.length !== before) console.log(`[SmallGroup ${maxGuest}] filtered ${before - imageTitles.length} forbidden image_titles`);
  }

  // 🛡️ Anti-spam guard: ถ้าลูกค้าไม่ได้ขอ "เมนู/ตัวอย่าง/ดูรูป" → drop image_titles ที่เป็น KB เมนู/ตัวอย่าง (กันเคส Ae Ka)
  // คีย์เวิร์ดอ่านจาก app_settings เพื่อให้แอดมินแก้ได้
  const menuReqKeywords: string[] = Array.isArray(cfg.menu_request_keywords) ? cfg.menu_request_keywords.filter((s: any) => typeof s === "string" && s.trim()) : [];
  const kbMenuKeywords: string[] = Array.isArray(cfg.kb_menu_title_keywords) ? cfg.kb_menu_title_keywords.filter((s: any) => typeof s === "string" && s.trim()) : [];
  const askedForMenu = menuReqKeywords.some(kw => String(messageText).includes(kw));
  if (!askedForMenu && imageTitles.length > 0 && kbMenuKeywords.length > 0) {
    const before = imageTitles.length;
    imageTitles = imageTitles.filter(t => {
      const s = String(t);
      if (/^(แพ็กเกจ:|โปรโมชั่น:|VDO)/.test(s)) return true; // tier/pkg/promo/video — ผ่านเสมอ
      return !kbMenuKeywords.some(kw => s.includes(kw));
    });
    if (imageTitles.length !== before) console.log(`[AntiSpam] dropped ${before - imageTitles.length} unsolicited menu/example images`);
  }

  // กฎทั้งหมด (รวมกฎชิม/นิมนต์) อยู่ใน strict_rules แล้ว — ไม่ต้องมี post-check hardcode
  let finalAnswer = answerText;


  // Expand bundle_image_titles — ถ้า AI ใส่ KB ที่มี bundle → แนบรูปเพื่อนไปด้วยอัตโนมัติ
  if (imageTitles.length > 0) {
    const expanded = [...imageTitles];
    for (const title of imageTitles) {
      const k = kbItems.find((x: any) => x.title === title);
      const bundle = Array.isArray(k?.bundle_image_titles) ? k.bundle_image_titles : [];
      for (const b of bundle) if (b && !expanded.includes(b)) expanded.push(b);
    }
    imageTitles = expanded.slice(0, 8);
  }

  // 🎬 Auto-attach VDO — ถ้า AI เลือก KB/แพ็ก/โปร ใดมา และไอเทมนั้นมีวิดีโออยู่ → แนบ VDO: ... ให้อัตโนมัติ
  // (AI ไม่ค่อยเลือก VDO เอง เพราะ field ชื่อ image_titles; categorization ของแอดมินถูกแล้ว ส่งทุกอย่างที่มี)
  if (imageTitles.length > 0) {
    const withVideos = [...imageTitles];
    const addOnce = (t: string) => { if (t && !withVideos.includes(t)) withVideos.push(t); };
    for (const title of imageTitles) {
      if (title.startsWith("VDO")) continue;
      if (title.startsWith("แพ็กเกจ: ")) {
        // tier ref ("แพ็กเกจ: ชื่อ — tier") หรือ package-level ("แพ็กเกจ: ชื่อ")
        const rest = title.replace("แพ็กเกจ: ", "");
        const pkgName = rest.split(" — ")[0];
        const p = pkgsWithVideos.find((x: any) => x.name === pkgName);
        if (p) addOnce(`VDO แพ็กเกจ: ${p.name}`);
      } else if (title.startsWith("โปรโมชั่น: ")) {
        const name = title.replace("โปรโมชั่น: ", "");
        const pr = promosWithVideos.find((x: any) => x.name === name);
        if (pr) addOnce(`VDO โปรโมชั่น: ${pr.name}`);
      } else {
        const k = kbWithVideos.find((x: any) => x.title === title);
        if (k) addOnce(`VDO: ${k.title}`);
      }
    }
    imageTitles = withVideos.slice(0, 8);
  }

  // 🖼️ Image invitation guard — strict_rules ห้าม AI เชิญชวนดูรูปโดยไม่มี image_titles
  // ถ้า AI ยังละเมิด (imageTitles ว่าง แต่ finalAnswer มีคำเชิญชวน) → strip ประโยคนั้นออก
  // กัน case ที่ลูกค้าเห็นข้อความ "ลองดูเมนูตามนี้เลยนะคะ" แต่ไม่มีรูปแนบมาจริง
  if (imageTitles.length === 0) {
    const INVITE_RE = /(ลองดูรูป|ลองดูเมนู|ลองดูภาพ|ดูภาพ|ดูหน้าตา|ดูตัวอย่าง|แนบรูปให้|แนบรูป|แนบเมนู|แนบให้ด้านล่าง|ส่งรูปให้|ส่งรูป[^ก-๙a-zA-Z]{0,3}ให้|ตามนี้เลยนะคะ|ตามนี้เลยค่ะ|ตามภาพ|เลือกได้ตามนี้|ดูรูปได้|จัดเตรียม.{0,10}เมนู|ให้เลือกชม|อยู่ด้านล่าง|ดูด้านล่าง|ด้านล่างนี้|portfolio|ภาพบรรยากาศ|รูปตัวอย่าง|เมนู.{0,10}ด้านนี้|ให้ชมด้านนี้|ดูรูป.{0,10}ด้านล่าง)/i;
    if (INVITE_RE.test(finalAnswer)) {
      const bubbles = finalAnswer.split(/\n*---+\n*/);
      const cleanedBubbles = bubbles.map((b) => {
        const parts = b.split(/(?<=[ค่ะคะ])[\s\n]+/).map((s) => s.trim()).filter(Boolean);
        return parts.filter((s) => !INVITE_RE.test(s)).join(" ").trim();
      }).filter(Boolean);
      const stripped = cleanedBubbles.join("\n---\n").trim();
      const before = finalAnswer;
      if (!stripped) {
        finalAnswer = "รับทราบค่ะ เดี๋ยวขอให้ทีมงานช่วยตรวจสอบข้อมูลให้เพิ่มเติมนะคะ 🙏";
        console.warn(`[ImageInviteGuard] fallback used — before="${before.slice(0, 120)}"`);
      } else {
        finalAnswer = stripped;
        console.warn(`[ImageInviteGuard] stripped invite without media. before="${before.slice(0, 120)}" after="${finalAnswer.slice(0, 120)}"`);
      }
    }
  }

  // Post-check: normalize Thai politeness suffixes (ค่ะนะคะ / นะค่ะ / นะคะค่ะ …)
  {
    const before = finalAnswer;
    finalAnswer = normalizeThaiPoliteness(finalAnswer);
    if (before !== finalAnswer) {
      console.log(`[ThaiPolitenessNormalize] fixed suffixes. before="${before.slice(0, 120)}" after="${finalAnswer.slice(0, 120)}"`);
    }
  }



  // Merge intent ที่ AI สกัดได้ → customers (เฉพาะที่ยังไม่มี)
  const intent = aiResp.intent || {};
  const intentUpdate: any = {};
  if (intent.event_type && !freshCustomer.event_type) intentUpdate.event_type = String(intent.event_type).slice(0, 100);
  if (intent.venue && !freshCustomer.venue) intentUpdate.venue = String(intent.venue).slice(0, 200);
  if (typeof intent.guest_count === "number" && intent.guest_count > 0 && !freshCustomer.guest_count) {
    intentUpdate.guest_count = Math.floor(intent.guest_count);
  }
  if (intent.nickname && !freshCustomer.nickname) {
    const nn = String(intent.nickname).trim().slice(0, 50);
    if (nn && nn.length >= 1 && nn.length <= 50) intentUpdate.nickname = nn;
  }
  if (!freshCustomer.event_date) {
    // Layer 1: parse Thai date จากข้อความลูกค้าเอง (กันพลาดมากกว่าเชื่อ AI)
    const parsed = parseThaiEventDate(messageText);
    if (parsed) {
      intentUpdate.event_date = parsed;
      console.log(`[Intent] event_date parsed from text: ${parsed}`);
    } else if (intent.event_date) {
      // Layer 2: ใช้ที่ AI ส่ง แต่ตรวจว่าไม่ใช่ปีในอดีต
      const d = String(intent.event_date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
        if (d >= today.slice(0, 4) + "-01-01") {
          intentUpdate.event_date = d;
        } else {
          console.warn(`[Intent] AI returned past event_date ${d} — ignored`);
        }
      }
    }
  }

  // 🧩 Merge extra_intent_json (configurable fields) — whitelist by intent_fields keys, validate values
  try {
    const rawExtra = (aiResp.extra_intent_json || "{}").trim();
    if (rawExtra && rawExtra !== "{}" && intentFields.length > 0) {
      const parsedExtra = JSON.parse(rawExtra);
      if (parsedExtra && typeof parsedExtra === "object" && !Array.isArray(parsedExtra)) {
        const allowedKeys = new Set(intentFields.map((f: any) => String(f.key)));
        const fieldByKey: Record<string, any> = Object.fromEntries(intentFields.map((f: any) => [f.key, f]));
        const merged: Record<string, any> = { ...customerIntentData };
        let changed = false;
        for (const [k, v] of Object.entries(parsedExtra)) {
          if (!allowedKeys.has(k)) continue;
          if (v === null || v === undefined || String(v).trim() === "") continue;
          const sval = String(v).slice(0, 300).trim();
          const allowed = Array.isArray(fieldByKey[k]?.values) ? fieldByKey[k].values : [];
          if (allowed.length > 0 && !allowed.includes(sval)) {
            console.warn(`[IntentData] dropped ${k}="${sval}" — not in allowed values`);
            continue;
          }
          if (merged[k] !== sval) { merged[k] = sval; changed = true; }
        }
        if (changed) {
          intentUpdate.intent_data = merged;
          console.log(`[IntentData] merged`, merged);
        }

        // 🪞 Mirror standard keys from intent_data → customers columns (only fill blanks, never overwrite admin edits)
        // NOTE: ห้าม mirror service_type → event_type เด็ดขาด (service_type = รูปแบบอาหาร, event_type = ประเภทงาน)
        const mirrorMap: Record<string, string> = {
          event_type: "event_type",
          venue: "venue",
          location: "venue",
          guest_count: "guest_count",
          guests: "guest_count",
          event_date: "event_date",
          total_amount: "clv_amount",
          budget: "clv_amount",
        };
        for (const [srcKey, colName] of Object.entries(mirrorMap)) {
          const v = merged[srcKey];
          if (v === undefined || v === null || String(v).trim() === "") continue;
          if ((freshCustomer as any)[colName]) continue; // don't overwrite
          if (intentUpdate[colName]) continue; // already set this round
          if (colName === "guest_count") {
            const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
            if (n > 0) intentUpdate.guest_count = n;
          } else if (colName === "clv_amount") {
            const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
            if (n > 0) intentUpdate.clv_amount = n;
          } else if (colName === "event_date") {
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) intentUpdate.event_date = String(v);
          } else {
            intentUpdate[colName] = String(v).slice(0, 200);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn(`[IntentData] parse failed: ${e.message}`);
  }

  if (Object.keys(intentUpdate).length > 0) {
    await supabase.from("customers").update(intentUpdate).eq("id", customer.id);
    console.log(`[Intent] saved`, intentUpdate);
  }

  // 📝 Audit log — บันทึก AI reply เพื่อให้ owner เปิดมาไล่ตรวจย้อนหลังได้
  logAiAudit(supabase, {
    customer_id: customer.id,
    line_user_id: lineUserId,
    customer_message: messageText,
    ai_reply: finalAnswer,
    ai_reply_bubbles: finalAnswer.split(/\n*---+\n*/).map(s => s.trim()).filter(Boolean),
    image_titles: imageTitles,
    intent_extracted: { ...(aiResp.intent || {}), ...(intentUpdate.intent_data ? { extra: intentUpdate.intent_data } : {}) },
    confidence,
    model: aiResp._model || null,
    tokens_in: aiResp._usage?.prompt_tokens ?? aiResp._usage?.input_tokens ?? null,
    tokens_out: aiResp._usage?.completion_tokens ?? aiResp._usage?.output_tokens ?? null,
    latency_ms: _aiLatency,
    recent_context: recentMsgs,
    status: "sent",
    packages_retrieved: (usePkgs || []).map((p: any) => ({
      id: p.id, name: p.name, category: p.category,
      tiers: (p.pricing_tiers || []).map((t: any) => ({ tier: t.tier_name, guest_pax: t.guest_pax, total_pax: t.total_pax, price: t.price })),
    })),
    knowledge_retrieved: (filteredKb || []).map((k: any) => ({ id: k.id, title: k.title, category: k.category })),
    system_prompt_excerpt: systemPrompt,
  });




  if (aiResp.confirm_existing_phone && hasPhone) {
    const muteH = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
    await saveAndPushAi(supabase, lineUserId, [{ type: "text", text: finalAnswer }], { customer_id: customer.id, message: finalAnswer, sender: "ai", confidence_score: confidence });
    // 🛡️ admin_bot_override = true → ไม่แตะ ai_active (เคารพการตัดสินใจของแอด)
    const patch: any = {
      manual_chat_until: muteUntil,
      last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${finalAnswer.slice(0, 60)}`,
    };
    const confirmDecision = resolveAdminHandoffDecision({
      adminBotOverride: freshCustomer.admin_bot_override,
      reason: "confirm_existing_phone",
    });
    if (confirmDecision.disableAi) patch.ai_active = false;
    await supabase.from("customers").update(patch).eq("id", customer.id);
    return;
  }

  // Media dedup (KB + package-level + tier-level + promo + videos) — keep order from image_titles
  type Media = { type: "image" | "video"; url: string; thumb?: string };
  const mediaList: Media[] = [];

  // Fuzzy match for AI hallucinated titles
  function fuzzyKB(needle: string) {
    const n = needle.toLowerCase().trim();
    return kbWithImages.find((x: any) =>
      x.title.toLowerCase() === n || x.title.toLowerCase().includes(n) || n.includes(x.title.toLowerCase())
    );
  }
  function fuzzyPkg(needle: string) {
    const n = needle.toLowerCase().trim();
    return pkgsWithImages.find((x: any) =>
      x.name.toLowerCase() === n || x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase())
    );
  }

  for (const title of imageTitles) {
    if (title.startsWith("VDO โปรโมชั่น: ")) {
      const name = title.replace("VDO โปรโมชั่น: ", "");
      const pr = promosWithVideos.find((x: any) => x.name === name);
      if (pr) for (const v of getItemVideos(pr)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("VDO แพ็กเกจ: ")) {
      const name = title.replace("VDO แพ็กเกจ: ", "");
      const p = pkgsWithVideos.find((x: any) => x.name === name);
      if (p) for (const v of getItemVideos(p)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("VDO: ")) {
      const t = title.replace("VDO: ", "");
      const k = kbWithVideos.find((x: any) => x.title === t);
      if (k) for (const v of getItemVideos(k)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("แพ็กเกจ: ") && title.includes(" — ")) {
      const t = tierImageRefs.find((x) => x.title === title);
      if (t) mediaList.push({ type: "image", url: t.url });
    } else if (title.startsWith("แพ็กเกจ: ")) {
      const name = title.replace("แพ็กเกจ: ", "");
      let p = pkgsWithImages.find((x: any) => x.name === name);
      if (!p) p = fuzzyPkg(name); // fuzzy fallback
      if (p) for (const u of getItemImages(p)) mediaList.push({ type: "image", url: u });
    } else if (title.startsWith("โปรโมชั่น: ")) {
      const name = title.replace("โปรโมชั่น: ", "");
      const pr = promosWithImages.find((x: any) => x.name === name);
      if (pr) for (const u of getItemImages(pr)) mediaList.push({ type: "image", url: u });
    } else {
      let k = kbWithImages.find((x: any) => x.title === title);
      if (!k) k = fuzzyKB(title); // fuzzy fallback
      if (k) for (const u of getItemImages(k)) mediaList.push({ type: "image", url: u });
    }
  }
  // dedup URLs (กันรูปซ้ำ) + cap แยกระหว่างรูป/วิดีโอ
  // - รูป: cap จาก Settings (max_images_per_reply, default 5) กัน spam
  // - วิดีโอ: ส่งทุกตัวที่ AI เลือก (cap แยก 3 คลิป) เพราะวิดีโอสำคัญ ต้องไปถึงลูกค้า
  const maxImages = Math.max(1, Math.min(20, Number(cfg.max_images_per_reply) || 5));
  const maxVideos = 3;
  const seenUrls = new Set<string>();
  const dedupMedia = mediaList.filter(m => {
    if (seenUrls.has(m.url)) return false;
    seenUrls.add(m.url); return true;
  });
  const videos = dedupMedia.filter(m => m.type === "video").slice(0, maxVideos);
  const images = dedupMedia.filter(m => m.type === "image").slice(0, maxImages);
  // ส่งวิดีโอก่อนรูป เพื่อให้ลูกค้าเห็นวิดีโอเด่นในแชท
  let allMedia = [...videos, ...images];

  const lastSent = Array.isArray(customer.last_sent_image_titles) ? customer.last_sent_image_titles : [];
  const sameTitles = [...imageTitles].sort().join("|") === [...lastSent].sort().join("|") && imageTitles.length > 0;

  // 🧹 MediaDedup — strip media URLs ที่เคยส่งให้ลูกค้าคนนี้ใน 10 นาทีล่าสุด
  // Patch 2.5: bypass เมื่อลูกค้า "ขอดูรายละเอียด/เมนู/แพ็ก/ราคา/รูป" อีกครั้ง — เจตนาชัดว่าต้องการเห็นซ้ำ
  const DETAIL_REQUEST_RE = /(ขอดู|ขอ\s*ดู|ขอ\s*(รายละเอียด|เมนู|รูป|ภาพ|ตัวอย่าง)|รายละเอียด|ดูเมนู|ดูรูป|ดูภาพ|ดูแพ็ก|ดูราคา|ส่ง(รูป|เมนู|แพ็ก|ตัวอย่าง|รายละเอียด)|มีแบบไหน|มีแพ็ก|แพ็กไหน|แพ็กอะไร)/i;
  const customerAskedForDetails = DETAIL_REQUEST_RE.test(String(messageText || ""));
  let mediaToSend = (sameTitles && !customerAskedForDetails) ? [] : allMedia;
  if (sameTitles && customerAskedForDetails) {
    console.log(`[MediaDedup] sameTitles bypassed — customer asked for details (count=${allMedia.length})`);
  }
  // (customerAskedForDetails already computed above)
  if (mediaToSend.length > 0 && !customerAskedForDetails) {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: recentAi } = await supabase
        .from("conversations")
        .select("message")
        .eq("customer_id", customer.id)
        .eq("sender", "ai")
        .gte("created_at", tenMinAgo);
      const recentUrls = new Set<string>();
      for (const row of recentAi || []) {
        const msg = String((row as any).message || "");
        const urlMatches = msg.match(/https?:\/\/[^\s]+/g) || [];
        for (const u of urlMatches) recentUrls.add(u);
      }
      if (recentUrls.size > 0) {
        const before = mediaToSend.length;
        mediaToSend = mediaToSend.filter(m => !recentUrls.has(m.url));
        const stripped = before - mediaToSend.length;
        if (stripped > 0) {
          console.log(`[MediaDedup] stripped duplicate media count=${stripped}`);
        }
        console.log(`[MediaDedup] remaining media count=${mediaToSend.length}`);
      }
    } catch (e: any) {
      console.warn(`[MediaDedup] lookup failed: ${e?.message || e}`);
    }
  } else if (customerAskedForDetails && mediaToSend.length > 0) {
    console.log(`[MediaDedup] bypassed — customer explicitly asked for details (count=${mediaToSend.length})`);
  }

  // ถ้า strip แล้วไม่มี media เหลือ + finalAnswer พูดเหมือนแนบรูป → เข้า ImageInviteGuard fallback อีกรอบ
  if (mediaToSend.length === 0 && imageTitles.length > 0) {
    const INVITE_RE_2 = /(ลองดูรูป|ลองดูเมนู|ลองดูภาพ|ดูภาพ|ดูตัวอย่าง|แนบรูป|แนบเมนู|แนบให้ด้านล่าง|ส่งรูป|ตามภาพ|ตามนี้เลย|จัดเตรียม.{0,10}เมนู|ให้เลือกชม|อยู่ด้านล่าง|ดูด้านล่าง|ด้านล่างนี้|ภาพบรรยากาศ|รูปตัวอย่าง|ด้านนี้)/i;
    if (INVITE_RE_2.test(finalAnswer)) {
      const before = finalAnswer;
      const bubbles = finalAnswer.split(/\n*---+\n*/);
      const cleaned = bubbles.map((b) => b.split(/(?<=[ค่ะคะ])[\s\n]+/).map(s => s.trim()).filter(s => s && !INVITE_RE_2.test(s)).join(" ").trim()).filter(Boolean).join("\n---\n").trim();
      finalAnswer = cleaned || "รับทราบค่ะ เดี๋ยวขอให้ทีมงานช่วยตรวจสอบข้อมูลให้เพิ่มเติมนะคะ 🙏";
      console.warn(`[ImageInviteGuard] stripped invite (media dedup emptied) before="${before.slice(0,120)}" after="${finalAnswer.slice(0,120)}"`);
    }
  }

  // 🛡️ Patch 2.7 Fix 2 — Final media safety: ถ้า mediaToSend สุดท้าย = 0
  // ห้าม finalAnswer อ้างถึงรูป/ภาพ/ด้านล่าง/แนบรูป/ตามรูป/ในภาพ/จากรูป/ส่งรูป
  // ครอบทุกกรณี (imageTitles ว่างตั้งแต่ต้น, AntiSpam drop, MediaDedup strip, sameTitles)
  if (mediaToSend.length === 0) {
    const FINAL_MEDIA_RE = /(ดูรูป|ดูภาพ|ตามรูป|ตามภาพ|ในภาพ|จากรูป|จากภาพ|แนบรูป|แนบภาพ|แนบเมนู|ส่งรูป|ส่งภาพ|ด้านล่างนี้|ด้านล่างค่ะ|ด้านล่างนะคะ|ดูด้านล่าง|อยู่ด้านล่าง|ตามด้านล่าง|ตามนี้เลย|รูปด้านล่าง|ภาพด้านล่าง|รูปตัวอย่าง|ภาพตัวอย่าง|ตามที่แนบ|ที่แนบมา)/i;
    if (FINAL_MEDIA_RE.test(finalAnswer)) {
      const before = finalAnswer;
      const bubblesRaw = finalAnswer.split(/\n*---+\n*/);
      const cleaned = bubblesRaw
        .map((b) =>
          b
            .split(/(?<=[ค่ะคะ])[\s\n]+/)
            .map((s) => s.trim())
            .filter((s) => s && !FINAL_MEDIA_RE.test(s))
            .join(" ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n---\n")
        .trim();
      finalAnswer = cleaned || "รับทราบค่ะ เดี๋ยวขอให้ทีมงานช่วยตรวจสอบข้อมูลให้เพิ่มเติมนะคะ 🙏";
      console.warn(`[FinalMediaSafety] no media to send — stripped image refs. before="${before.slice(0, 140)}" after="${finalAnswer.slice(0, 140)}"`);
    }
  }


  const bubbles = finalAnswer.split(/\n*---+\n*/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  const textBubbles = bubbles.length > 0 ? bubbles : [finalAnswer];
  const toLineMsg = (m: { type: string; url: string; thumb?: string }) => {
    if (m.type === "video") {
      // ใช้ native video → thumbnail เต็มบับเบิล + ปุ่ม ▶️ กดเล่นในแชทเลย
      return {
        type: "video",
        originalContentUrl: m.url,
        previewImageUrl: m.thumb || m.url,
      };
    }
    return { type: "image", originalContentUrl: m.url, previewImageUrl: m.url };
  };

  // ส่งเป็น batch ละ 5 ข้อความ (LINE limit) — text bubbles อยู่ batch แรก แล้วทยอยส่งรูปที่เหลือเป็นชุดๆ จนครบ
  const firstBatch: any[] = textBubbles.map(t => ({ type: "text", text: t }));
  const firstSlots = Math.max(0, 5 - firstBatch.length);
  let mediaIdx = 0;
  for (; mediaIdx < Math.min(firstSlots, mediaToSend.length); mediaIdx++) {
    firstBatch.push(toLineMsg(mediaToSend[mediaIdx]));
  }

  const savedMsg = mediaToSend.length > 0
    ? `${finalAnswer}\n${mediaToSend.map(m => `${m.type === "video" ? "🎬" : "📎"} ${m.url}`).join("\n")}`
    : finalAnswer;

  // 🔒 AI-reply-per-turn duplicate lock (60s window)
  // ป้องกัน webhook duplicate / parallel instance ตอบซ้ำใน customer turn เดียวกัน
  // - หา timestamp ของ customer message ล่าสุด (ถ้ามี lineMsgId ใช้ตรงตัว)
  // - ถ้ามี AI reply หลัง timestamp นั้น และภายใน 60 วิ → skip
  try {
    let customerMsgTs: string | null = null;
    if (lineMsgId) {
      const { data: cMsg } = await supabase
        .from("conversations")
        .select("created_at")
        .eq("customer_id", customer.id)
        .eq("line_message_id", lineMsgId)
        .eq("sender", "customer")
        .maybeSingle();
      customerMsgTs = (cMsg as any)?.created_at ?? null;
    }
    if (!customerMsgTs) {
      const { data: latestC } = await supabase
        .from("conversations")
        .select("created_at")
        .eq("customer_id", customer.id)
        .eq("sender", "customer")
        .order("created_at", { ascending: false })
        .limit(1);
      customerMsgTs = (latestC?.[0] as any)?.created_at ?? null;
    }
    if (customerMsgTs) {
      const sixtySecAgo = new Date(Date.now() - 60_000).toISOString();
      const cutoff = customerMsgTs > sixtySecAgo ? customerMsgTs : sixtySecAgo;
      const { data: aiAfter } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customer.id)
        .eq("sender", "ai")
        .gte("created_at", cutoff)
        .limit(1);
      if (aiAfter && aiAfter.length > 0) {
        console.log(`[AIReplyLock] duplicate skipped customer=${customer.id} lineMsg=${lineMsgId ?? "n/a"}`);
        return;
      }
    }
  } catch (e: any) {
    console.warn(`[AIReplyLock] lookup failed: ${e?.message || e}`);
  }

  // 1) Insert AI conversation row FIRST (so admin sees what bot will send, even if LINE push fails mid-way)
  const { data: insertedConv, error: convErr } = await supabase
    .from("conversations")
    .insert({ customer_id: customer.id, message: savedMsg, sender: "ai", confidence_score: confidence })
    .select("id")
    .single();
  if (convErr) {
    console.error(`[SaveAiFailed-pre-push multi-batch]`, convErr.message);
    await logDelivery(supabase, {
      event_type: "save_failed_pre_push", severity: "error",
      customer_id: customer.id, line_user_id: lineUserId,
      message: savedMsg, details: { error: convErr.message, multi_batch: true },
    });
    return;
  }

  // 2) Push first batch — if fails, rollback DB row and abort (don't send images either)
  const firstRes = await pushLine(lineUserId, firstBatch);
  if (!firstRes.ok) {
    await supabase.from("conversations").delete().eq("id", insertedConv.id);
    console.error(`[Rollback] removed conv ${insertedConv.id} — first batch push failed`);
    await logDelivery(supabase, {
      event_type: "rollback_push_failed", severity: "error",
      customer_id: customer.id, line_user_id: lineUserId,
      conv_id: insertedConv.id, message: savedMsg,
      details: { status: firstRes.status, batch: "first" },
    });
    return;
  }
  // Save line_message_id of first text bubble so customer quote-replies link back
  const firstSentId = firstRes.sentMessages?.[0]?.id;
  if (firstSentId) await supabase.from("conversations").update({ line_message_id: firstSentId }).eq("id", insertedConv.id);
  console.log(`[AIReplyLock] marked turn replied customer=${customer.id} conv=${insertedConv.id}`);

  // 3) Push remaining media chunks — if any fails, keep the DB row (text already delivered)
  let partialFail = false;
  while (mediaIdx < mediaToSend.length) {
    const chunk = mediaToSend.slice(mediaIdx, mediaIdx + 5).map(toLineMsg);
    mediaIdx += chunk.length;
    const r = await pushLine(lineUserId, chunk);
    if (!r.ok) {
      console.error(`[PartialPushFail] conv ${insertedConv.id} — some media chunks failed to deliver`);
      partialFail = true;
      await logDelivery(supabase, {
        event_type: "partial_push_fail", severity: "warn",
        customer_id: customer.id, line_user_id: lineUserId,
        conv_id: insertedConv.id, message: savedMsg,
        details: { status: r.status, media_total: mediaToSend.length, media_sent: mediaIdx - chunk.length },
      });
      break;
    }
  }

  if (!partialFail) {
    await logDelivery(supabase, {
      event_type: "ai_reply_sent", severity: "info",
      customer_id: customer.id, line_user_id: lineUserId,
      conv_id: insertedConv.id, message: savedMsg,
      details: { bubbles: textBubbles.length, media: mediaToSend.length, multi_batch: true },
    });
  }

  const update: any = {
    last_message_at: new Date().toISOString(),
    last_message_snippet: `🤖 ${finalAnswer.slice(0, 60)}`,
  };
  if (imageTitles.length > 0) update.last_sent_image_titles = imageTitles;

  // Auto-handover: ตรวจจับเฉพาะตอน AI พูดชัดว่า "ขอส่งต่อ/ขอประสาน" — ไม่จับประโยคสุภาพทั่วไปอย่าง "เจ้าหน้าที่จะติดต่อกลับ"
  const handoverPatterns = /ขอ(ส่งต่อ|ประสาน(งาน)?|โอน|ฝาก)(ให้|เรื่อง|ข้อมูล)?(ทีมงาน|เจ้าหน้าที่|แอดมิน|ฝ่าย\S*)|(ส่งต่อ|ประสาน)(ให้|เรื่อง)(ทีมงาน|เจ้าหน้าที่|แอดมิน|ฝ่าย\S*)(ดูแล|รับช่วง|ช่วย|พิจารณา)|(แจ้ง|บอก)(ทีมงาน|เจ้าหน้าที่|แอดมิน)ให้(ติดต่อ|รับช่วง|ดูแล)/;
  // ไม่ตรวจจับถ้า AI กำลังขอเบอร์/ยืนยันเบอร์ (เพราะมักพูดว่า "เจ้าหน้าที่จะติดต่อกลับที่เบอร์...")
  const isAskingPhone = /เบอร์|โทร|ติดต่อกลับที่/.test(finalAnswer);
  if (handoverPatterns.test(finalAnswer) && !isAskingPhone) {
    const muteH = cfg.manual_chat_hours ?? 360;
    update.manual_chat_until = new Date(Date.now() + muteH * 3600000).toISOString();
    // 🛡️ admin_bot_override = true → ไม่ปิดบอท (เคารพการตัดสินใจของแอด)
    const handoverDecision = resolveAdminHandoffDecision({
      adminBotOverride: freshCustomer.admin_bot_override,
      reason: "handover_promise",
    });
    if (handoverDecision.disableAi) update.ai_active = false;
    console.log(handoverDecision.logMessage);
  }

  await supabase.from("customers").update(update).eq("id", customer.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.text();
    const signature = req.headers.get("x-line-signature") || "";
    const cfg = await getLineConfig();
    LINE_TOKEN = cfg.channel_access_token;
    if (cfg.channel_secret && (!signature || !(await verifySignature(body, signature, cfg.channel_secret)))) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    const { events = [] } = JSON.parse(body || "{}");
    if (events.length === 0) return Response.json({ ok: true });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const work = (async () => {
      for (const ev of events) {
        try { await processEvent(ev, supabase); }
        catch (e: any) { console.error("processEvent error:", e.message); }
      }
    })();
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else work.catch(e => console.error(e));

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("webhook error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
