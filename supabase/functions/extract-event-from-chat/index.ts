import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logTokenUsage } from "../_shared/log-token-usage.ts";
import { requireStaffOrService } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGES = 60;

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
      .select("conversation_summary, intent_data, event_type, guest_count, event_date, venue, clv_amount")
      .eq("id", customer_id)
      .maybeSingle();

    const { data: msgs } = await supabase
      .from("conversations")
      .select("sender, message, created_at")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    const all = (msgs || []).reverse();
    if (all.length === 0) {
      return Response.json({ ok: true, extracted: {} }, { headers: corsHeaders });
    }

    const text = all.map(m => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`).join("\n");
    const summary = customer?.conversation_summary ? `\n\nสรุปก่อนหน้า:\n${customer.conversation_summary}` : "";

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
- event_date: วันจัดงาน (YYYY-MM-DD) ถ้าไม่ระบุ/ระบุไม่ชัด → null
- venue: สถานที่/จังหวัด ถ้าไม่ระบุ → null
- total_amount: ยอดเงินที่ตกลง/CLV (เลข บาท) ถ้าไม่มี → 0
- notes: สรุปสั้นๆ ข้อตกลงพิเศษ/รายละเอียดเพิ่มเติม (ไม่เกิน 200 ตัวอักษร) ถ้าไม่มี → ""

ตอบเป็น JSON อย่างเดียว ห้ามมีคำอธิบายอื่น

บทสนทนา:
${text}${summary}`
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

    // Sanitize
    const out: any = {
      event_type: extracted.event_type || customer?.event_type || null,
      guest_count: Number.isFinite(extracted.guest_count) ? Math.floor(extracted.guest_count) : (customer?.guest_count || null),
      event_date: extracted.event_date || customer?.event_date || null,
      venue: extracted.venue || customer?.venue || null,
      total_amount: Number(extracted.total_amount) > 0 ? Number(extracted.total_amount) : (Number(customer?.clv_amount) || 0),
      notes: (extracted.notes || "").toString().slice(0, 500),
    };

    return Response.json({ ok: true, extracted: out }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("extract-event-from-chat error:", e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: corsHeaders });
  }
});
