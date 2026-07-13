import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logTokenUsage } from "../_shared/log-token-usage.ts";
import { requireStaffOrService } from "../_shared/auth-guard.ts";
import { parseThaiDateCandidates, stripImageOcrBlocks, type ThaiDateCandidate } from "../_shared/ai-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGES = 60;

// -------- Deterministic date anchor helpers ---------------------------------

export interface DateAnchorInput {
  messages: Array<{ sender: string; message: string }>; // reverse-chronological doesn't matter; we tag by sender
  nickname?: string | null;
  storedEventDate?: string | null; // YYYY-MM-DD
  todayYear?: number;
}

export interface DateAnchorResult {
  proposedIso: string | null; // YYYY-MM-DD or null
  confidence: "high" | "medium" | "low" | "conflict";
  source: string; // description of winning anchor
  candidates: Array<{ iso: string; source: string; raw: string }>;
  hasDayOnly: boolean; // any customer/admin day-only mention like "วันที่ 25"
  reason: string;
}

/**
 * Resolve event date anchor from evidence with strict priority.
 * Ordering (highest first):
 *   1. customer message with explicit day+month (latest wins)
 *   2. admin message with explicit day+month (latest wins)
 *   3. deterministic nickname date
 *   4. stored event_date (only if no other evidence)
 *   NEVER: assistant/AI/bot messages as primary anchor.
 * Returns confidence=conflict when different anchors give different months.
 */
export function resolveDateAnchor(input: DateAnchorInput): DateAnchorResult {
  const msgs = Array.isArray(input.messages) ? input.messages : [];
  const todayYear = input.todayYear ?? new Date().getUTCFullYear();
  const candidates: Array<{ iso: string; source: string; raw: string; priority: number }> = [];

  const dayOnlyRe = /วันที่\s*(\d{1,2})(?!\s*(?:มค|กพ|มีค|เมย|พค|มิย|กค|สค|กย|ตค|พย|ธค|ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา|\d|\/|-|\.))/;
  let hasDayOnly = false;

  // Walk messages, keep LAST customer/admin explicit date
  let latestCustomer: ThaiDateCandidate | null = null;
  let latestCustomerRaw = "";
  let latestAdmin: ThaiDateCandidate | null = null;
  let latestAdminRaw = "";
  for (const m of msgs) {
    const sender = (m.sender || "").toLowerCase();
    const text = String(m.message || "");
    if (sender === "customer") {
      if (dayOnlyRe.test(text)) hasDayOnly = true;
      const found = parseThaiDateCandidates(text, { todayYear });
      if (found.length > 0) { latestCustomer = found[found.length - 1]; latestCustomerRaw = found[found.length - 1].raw; }
    } else if (sender === "admin") {
      const found = parseThaiDateCandidates(text, { todayYear });
      if (found.length > 0) { latestAdmin = found[found.length - 1]; latestAdminRaw = found[found.length - 1].raw; }
    }
    // AI/bot/system: intentionally ignored as primary anchor
  }

  if (latestCustomer) candidates.push({ iso: latestCustomer.isoDate, source: "customer_message", raw: latestCustomerRaw, priority: 1 });
  if (latestAdmin) candidates.push({ iso: latestAdmin.isoDate, source: "admin_message", raw: latestAdminRaw, priority: 2 });

  if (input.nickname) {
    const nickHits = parseThaiDateCandidates(String(input.nickname), { todayYear });
    if (nickHits.length > 0) {
      candidates.push({ iso: nickHits[0].isoDate, source: "nickname", raw: nickHits[0].raw, priority: 3 });
    }
  }

  const stored = typeof input.storedEventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.storedEventDate) ? input.storedEventDate : null;
  if (stored) candidates.push({ iso: stored, source: "stored_event_date", raw: stored, priority: 4 });

  const nonStored = candidates.filter(c => c.source !== "stored_event_date");

  if (nonStored.length === 0) {
    if (stored) {
      return { proposedIso: stored, confidence: "low", source: "stored_event_date", candidates: candidates.map(c => ({ iso: c.iso, source: c.source, raw: c.raw })), hasDayOnly, reason: "no_new_evidence" };
    }
    return { proposedIso: null, confidence: "low", source: "none", candidates: [], hasDayOnly, reason: "no_evidence" };
  }

  // Conflict detection among priority 1..3
  const uniqueMonths = new Set(nonStored.map(c => c.iso.slice(0, 7))); // YYYY-MM
  const winner = nonStored.sort((a, b) => a.priority - b.priority)[0];
  const anchorMonth = winner.iso.slice(0, 7);
  const conflicts = nonStored.filter(c => c.iso.slice(0, 7) !== anchorMonth && c.priority !== winner.priority);

  if (uniqueMonths.size > 1 && conflicts.length > 0) {
    return { proposedIso: winner.iso, confidence: "conflict", source: winner.source, candidates: candidates.map(c => ({ iso: c.iso, source: c.source, raw: c.raw })), hasDayOnly, reason: `month_conflict: ${Array.from(uniqueMonths).join(",")}` };
  }

  const confidence: "high" | "medium" = winner.source === "customer_message" || winner.source === "admin_message" ? "high" : "medium";
  return { proposedIso: winner.iso, confidence, source: winner.source, candidates: candidates.map(c => ({ iso: c.iso, source: c.source, raw: c.raw })), hasDayOnly, reason: "ok" };
}

// -------- HTTP handler -------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const __auth = await requireStaffOrService(req);
  if (!__auth.ok) return Response.json({ error: __auth.error }, { status: __auth.status || 401, headers: corsHeaders });
  try {
    const { customer_id } = await req.json();
    if (!customer_id) return Response.json({ error: "missing customer_id" }, { status: 400, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: customer } = await supabase
      .from("customers")
      .select("nickname, conversation_summary, intent_data, event_type, guest_count, event_date, venue, clv_amount")
      .eq("id", customer_id)
      .maybeSingle();

    const { data: msgs } = await supabase
      .from("conversations")
      .select("sender, message, created_at")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    const all = (msgs || []).slice().reverse();
    if (all.length === 0) {
      return Response.json({ ok: true, extracted: {} }, { headers: corsHeaders });
    }

    // Deterministic date anchor (never uses AI messages as primary source)
    const anchor = resolveDateAnchor({
      messages: all.map(m => ({ sender: m.sender, message: m.message })),
      nickname: customer?.nickname ?? null,
      storedEventDate: customer?.event_date ?? null,
    });

    const text = all.map(m => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : m.sender === "system" ? "ระบบ" : "AI"}: ${m.message}`).join("\n");
    const summary = customer?.conversation_summary ? `\n\nสรุปก่อนหน้า:\n${customer.conversation_summary}` : "";

    const anchorHint = anchor.proposedIso
      ? `\n\n📌 DETERMINISTIC_DATE_ANCHOR (rule-based, ตรวจแล้ว — ให้ใช้ค่านี้เป็นหลัก):
- proposed_event_date: ${anchor.proposedIso}
- source: ${anchor.source}
- confidence: ${anchor.confidence}
- candidates: ${JSON.stringify(anchor.candidates)}
- ห้าม override ค่านี้ด้วยการเดาเดือน/ปีจากข้อความ AI/bot`
      : `\n\n📌 DETERMINISTIC_DATE_ANCHOR: ไม่พบวัน+เดือนชัดจาก customer/admin/nickname — ให้ตอบ event_date=null ถ้าไม่มั่นใจ`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: `วิเคราะห์บทสนทนาด้านล่าง แล้วดึงข้อมูลงานจัดเลี้ยงออกมาเป็น JSON (ภาษาไทย):
- event_type: ประเภทงาน (เช่น งานบวช, งานแต่ง, ขึ้นบ้านใหม่, งานบริษัท) ถ้าไม่ชัด → null
- guest_count: จำนวนแขก/คน (เลขจำนวนเต็ม) ถ้าไม่ระบุ → null
- event_date: วันจัดงาน (YYYY-MM-DD) — **ใช้ DETERMINISTIC_DATE_ANCHOR เป็นหลักถ้ามี** ถ้าไม่มี/ไม่ชัด → null
- venue: สถานที่/จังหวัด ถ้าไม่ระบุ → null
- total_amount: ยอดเงินที่ตกลง/CLV (เลข บาท) ถ้าไม่มี → 0
- notes: สรุปสั้นๆ ข้อตกลงพิเศษ/รายละเอียดเพิ่มเติม (ไม่เกิน 200 ตัวอักษร) ถ้าไม่มี → ""

กฎวันจัดงาน (สำคัญมาก):
- **ห้ามใช้ข้อความ AI/bot เป็น anchor หลักสำหรับวันที่**
- ถ้าลูกค้าพูดเลขวันเดี่ยว ๆ (เช่น "วันที่ 25") ห้ามเดาเดือน/ปี — ให้ยึด DETERMINISTIC_DATE_ANCHOR
- ถ้า confidence=conflict → ตอบ event_date=null

ตอบเป็น JSON อย่างเดียว ห้ามมีคำอธิบายอื่น

บทสนทนา:
${text}${summary}${anchorHint}`
        }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI gateway ${res.status}: ${err}`);
    }
    const data = await res.json();
    logTokenUsage(supabase, { model: MODEL, source: "extract-event", apiResponse: data, customerId: customer_id });

    let extracted: any = {};
    try {
      extracted = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    } catch {
      extracted = {};
    }

    // -------- Post-process safety net -----------------------------------
    // Prefer deterministic anchor when confidence is high; suppress when conflict.
    let finalEventDate: string | null = extracted.event_date || null;
    let review: { previous: string | null; proposed: string | null; reason: string; anchor: DateAnchorResult } | null = null;

    if (anchor.confidence === "conflict") {
      finalEventDate = null;
      review = { previous: customer?.event_date ?? null, proposed: anchor.proposedIso, reason: "conflict", anchor };
    } else if (anchor.confidence === "high" && anchor.proposedIso) {
      // Trust deterministic anchor over AI's parse when they disagree on month
      if (!finalEventDate || finalEventDate.slice(0, 7) !== anchor.proposedIso.slice(0, 7)) {
        finalEventDate = anchor.proposedIso;
      }
    } else if (anchor.confidence === "medium" && anchor.proposedIso && !finalEventDate) {
      finalEventDate = anchor.proposedIso;
    }

    // Month-change safety: if new date changes month from stored AND confidence<high → suppress + review
    const stored = customer?.event_date ?? null;
    if (stored && finalEventDate && stored !== finalEventDate) {
      const monthChanged = stored.slice(0, 7) !== finalEventDate.slice(0, 7);
      if (monthChanged && anchor.confidence !== "high") {
        review = review ?? { previous: stored, proposed: finalEventDate, reason: "month_change_low_confidence", anchor };
        finalEventDate = null; // do not silently overwrite
      }
    }

    // Emit system note when suppressed / review needed
    if (review) {
      try {
        const msg = `[DATE_REVIEW] เจอวันจัดงานที่ต้องยืนยัน — old=${review.previous ?? "-"} proposed=${review.proposed ?? "-"} reason=${review.reason} source=${review.anchor.source} confidence=${review.anchor.confidence} candidates=${JSON.stringify(review.anchor.candidates)}`;
        await supabase.from("conversations").insert({ customer_id, sender: "system", message: msg, is_fallback: false });
      } catch (e: any) {
        console.warn(`[extract-event] failed to insert review note: ${e?.message || e}`);
      }
    }

    const out: any = {
      event_type: extracted.event_type || customer?.event_type || null,
      guest_count: Number.isFinite(extracted.guest_count) ? Math.floor(extracted.guest_count) : (customer?.guest_count || null),
      event_date: finalEventDate || customer?.event_date || null,
      venue: extracted.venue || customer?.venue || null,
      total_amount: Number(extracted.total_amount) > 0 ? Number(extracted.total_amount) : (Number(customer?.clv_amount) || 0),
      notes: (extracted.notes || "").toString().slice(0, 500),
      // Diagnostic (caller may ignore):
      _date_anchor: { proposed: anchor.proposedIso, confidence: anchor.confidence, source: anchor.source, suppressed: !!review, reason: review?.reason ?? null },
    };

    return Response.json({ ok: true, extracted: out }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("extract-event-from-chat error:", e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: corsHeaders });
  }
});
