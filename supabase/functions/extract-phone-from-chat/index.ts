import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logTokenUsage } from "../_shared/log-token-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGES = 80;

// เบอร์มือถือไทย 10 หลัก ขึ้นต้น 06/08/09 (Tax ID 13 หลักจะถูกตัดออก)
function normalizeThaiPhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  if (!/^(06|08|09)/.test(digits)) return null;
  return digits;
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
      .select("phone")
      .eq("id", customer_id)
      .maybeSingle();

    if (customer?.phone) {
      return Response.json({ ok: true, skipped: "already has phone" }, { headers: corsHeaders });
    }

    const { data: msgs } = await supabase
      .from("conversations")
      .select("sender, message, created_at")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    const all = (msgs || []).reverse();
    if (all.length === 0) return Response.json({ ok: true, extracted: null }, { headers: corsHeaders });

    const text = all
      .map((m) => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: `อ่านบทสนทนาด้านล่าง แล้วดึงเฉพาะ "เบอร์โทรศัพท์มือถือของลูกค้า" ออกมา
- ต้องเป็นเบอร์ที่ "ลูกค้า" พิมพ์/ให้ไว้เท่านั้น (ไม่ใช่เบอร์ร้าน/แอดมิน/เบอร์ในลิงก์)
- เบอร์มือถือไทย 10 หลัก ขึ้นต้น 06/08/09
- ห้ามเอาเลขผู้เสียภาษี 13 หลัก / เลขบัญชี / รหัสไปรษณีย์
- ถ้าไม่พบ → ตอบ {"phone": null}
- ถ้าพบหลายเบอร์ → เลือกเบอร์ล่าสุดที่ลูกค้าระบุว่าเป็นเบอร์ติดต่อ

ตอบ JSON อย่างเดียว: {"phone": "0812345678"} หรือ {"phone": null}

บทสนทนา:
${text}`,
        }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI gateway ${res.status}: ${err}`);
    }
    const data = await res.json();
    logTokenUsage(supabase, { model: MODEL, source: "extract-phone", apiResponse: data, customerId: customer_id });

    let parsed: any = {};
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch {}

    const phone = normalizeThaiPhone(parsed?.phone || "");
    if (!phone) return Response.json({ ok: true, extracted: null }, { headers: corsHeaders });

    // Re-check ก่อน update (กันชนกับการกรอกมือ)
    const { data: fresh } = await supabase.from("customers").select("phone").eq("id", customer_id).maybeSingle();
    if (fresh?.phone) return Response.json({ ok: true, skipped: "already has phone (race)" }, { headers: corsHeaders });

    await supabase.from("customers").update({ phone }).eq("id", customer_id);
    return Response.json({ ok: true, extracted: phone }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("extract-phone-from-chat error:", e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: corsHeaders });
  }
});
