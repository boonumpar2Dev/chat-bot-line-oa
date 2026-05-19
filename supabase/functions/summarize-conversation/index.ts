import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logTokenUsage } from "../_shared/log-token-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const KEEP_RECENT = 10;
const TRIGGER_THRESHOLD = 20;

async function summarize(text: string, supabase: any, customerId?: string): Promise<string> {
  const model = "google/gemini-2.5-flash-lite";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: `สรุปบทสนทนาด้านล่างเป็นภาษาไทย ให้สั้น กระชับ เก็บเฉพาะข้อมูลสำคัญ:
- ลูกค้าสนใจอะไร (ประเภทงาน/แพ็กเกจ/จำนวนคน/วันจัด/สถานที่)
- คำถามที่ลูกค้าถาม + คำตอบหลักจาก AI
- เคสพิเศษ/เงื่อนไขที่ตกลงกัน
- ข้อมูลที่ลูกค้าให้แล้ว (เบอร์/Tax ID/แท็ก)
ไม่เกิน 250 ตัวอักษร ห้ามใส่คำนำ ตอบเป็น plain text เท่านั้น

บทสนทนา:
${text}`
      }],
    }),
  });
  if (!res.ok) throw new Error(`summarize gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  logTokenUsage(supabase, { model, source: "summarize", apiResponse: data, customerId });
  return (data.choices?.[0]?.message?.content || "").trim().slice(0, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { customer_id } = await req.json();
    if (!customer_id) return Response.json({ error: "missing customer_id" }, { status: 400, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: customer } = await supabase
      .from("customers")
      .select("conversation_summary, summary_until_message_id")
      .eq("id", customer_id)
      .maybeSingle();

    // Get all messages in chronological order
    const { data: msgs } = await supabase
      .from("conversations")
      .select("id, sender, message, created_at")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: true });

    const all = msgs || [];
    if (all.length < TRIGGER_THRESHOLD) {
      return Response.json({ ok: true, skipped: "below threshold", count: all.length }, { headers: corsHeaders });
    }

    // Find index of last summarized message (if any)
    let startIdx = 0;
    if (customer?.summary_until_message_id) {
      const idx = all.findIndex(m => m.id === customer.summary_until_message_id);
      if (idx >= 0) startIdx = idx + 1;
    }

    const toSummarize = all.slice(startIdx, all.length - KEEP_RECENT);
    if (toSummarize.length < 5) {
      return Response.json({ ok: true, skipped: "not enough new messages", new: toSummarize.length }, { headers: corsHeaders });
    }

    const text = toSummarize.map(m => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`).join("\n");
    let newSummary = await summarize(text);

    // Merge with previous summary if exists
    if (customer?.conversation_summary) {
      const combined = `${customer.conversation_summary}\n${newSummary}`;
      if (combined.length > 500) {
        newSummary = await summarize(`สรุปก่อนหน้า: ${customer.conversation_summary}\n\nสรุปใหม่: ${newSummary}`);
      } else {
        newSummary = combined;
      }
    }

    const lastSummarizedId = toSummarize[toSummarize.length - 1].id;
    await supabase.from("customers").update({
      conversation_summary: newSummary,
      summary_until_message_id: lastSummarizedId,
    }).eq("id", customer_id);

    return Response.json({ ok: true, summary: newSummary, summarized_count: toSummarize.length }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("summarize-conversation error:", e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: corsHeaders });
  }
});
