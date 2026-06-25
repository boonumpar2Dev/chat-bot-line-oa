// Analyze a customer's full chat → diagnose why AI replied wrong → propose rules/KB items
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logTokenUsage } from "../_shared/log-token-usage.ts";
import { requireStaffOrService } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `คุณคือ AI Coach วินิจฉัย AI แชทบอทขายงานจัดเลี้ยง
หน้าที่: อ่านบทสนทนาทั้งหมดของลูกค้า 1 ราย + คำตอบ AI ที่แอดมินคิดว่าผิด → วินิจฉัยว่าทำไม AI ตอบแบบนั้น → เสนอ "กฎ" หรือ "ความรู้" เพื่อกันไม่ให้พลาดซ้ำกับลูกค้าคนอื่น

เกณฑ์ตัดสิน:
- **rule (กฎ AI)**: คำสั่ง ห้าม/ต้อง/วิธีคุย/รูปแบบตอบ ที่ต้องใส่ทุกครั้ง (เช่น "ห้ามชวนต่างจังหวัดมาชิม", "ต้องถามจังหวัดก่อนเสนอราคา", "ตอบสั้นไม่เกิน 2 ประโยค")
- **knowledge (ฐานความรู้)**: ข้อมูล/ตัวเลข/ราคา/FAQ ที่ดึงมาใช้เมื่อลูกค้าถาม (เช่น "ค่าส่งกรุงเทพฟรี ต่างจังหวัด 15 บ./กม.", "เมนู A B C ราคา X")
- ก้ำกึ่ง → ถ้าไม่ใส่ใน prompt ทุกครั้ง AI จะพลาดไหม? ถ้าใช่ = rule

หลัก refine:
- rule: สั้น action-oriented เริ่มด้วย "ห้าม/ต้อง/เมื่อ X → Y" ≤2 บรรทัด
- knowledge: title สั้น ≤30 ตัวอักษร, content bullet, category จาก existing ถ้าตรง
- ครอบคลุมหลายเรื่อง → แตกเป็นหลาย item
- เทียบ existing_rules / existing_kb_titles → ถ้าซ้ำใส่ similar: [{type, snippet}]

ตอบ JSON เท่านั้น:
{
  "diagnosis": "1-3 ประโยค สรุปว่า AI พลาดตรงไหน เพราะอะไร (อ้างอิงบับเบิลถ้าได้)",
  "items": [{
    "type": "rule" | "knowledge",
    "content": "ข้อความที่จะบันทึก",
    "title": "(ถ้า knowledge)",
    "category": "(ถ้า knowledge)",
    "reasoning": "เหตุผลสั้น ทำไมจัดประเภทนี้ + กันเคสไหน",
    "similar": [{ "type": "rule"|"knowledge", "snippet": "..." }]
  }]
}
ถ้า AI ตอบไม่ได้ผิดอะไรเลย → items: [], diagnosis อธิบายเหตุผล`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const __auth = await requireStaffOrService(req);
  if (!__auth.ok) return Response.json({ error: __auth.error }, { status: __auth.status || 401, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const customerId: string = body.customer_id;
    const focusReply: string = body.focus_reply || "";
    const feedback: string = body.feedback || "";

    if (!customerId) {
      return new Response(JSON.stringify({ error: "missing customer_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [{ data: msgs }, { data: cfg }, { data: kb }, { data: cats }, { data: customer }] = await Promise.all([
      sb.from("conversations")
        .select("sender, message, created_at, confidence_score")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(60),
      sb.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle(),
      sb.from("knowledge_base").select("title").limit(200),
      sb.from("knowledge_categories").select("name").order("sort_order"),
      sb.from("customers").select("nickname, status, intent_data").eq("id", customerId).maybeSingle(),
    ]);

    const chronological = (msgs || []).slice().reverse();
    const transcript = chronological.map((m: any) => {
      const who = m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI";
      const conf = m.sender === "ai" && m.confidence_score != null ? ` [${m.confidence_score}%]` : "";
      const clean = String(m.message || "").replace(/https?:\/\/\S+/g, "[link]").slice(0, 500);
      return `${who}${conf}: ${clean}`;
    }).join("\n");

    const userPrompt = `=== บทสนทนากับลูกค้า ${customer?.nickname || "(ไม่ระบุชื่อ)"} (สถานะ: ${customer?.status || "-"}) ===
${transcript || "(ไม่มีบทสนทนา)"}

=== คำตอบ AI ที่แอดมินคิดว่าผิด/อยากปรับ ===
"""${focusReply || "(ไม่ระบุ — วิเคราะห์ภาพรวมทั้งบทสนทนา)"}"""

${feedback ? `=== Feedback จากแอดมิน ===\n${feedback}\n` : ""}
existing_rules (${(cfg?.strict_rules || []).length} ข้อ):
${(cfg?.strict_rules || []).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") || "(ไม่มี)"}

existing_kb_titles:
${(kb || []).map((k: any) => `- ${k.title}`).join("\n") || "(ไม่มี)"}

existing_categories: ${(cats || []).map((c: any) => c.name).join(", ") || "(ไม่มี)"}

วินิจฉัยและตอบ JSON ตามฟอร์แมต`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI ทำงานหนัก รออีกครู่นะคะ" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI credits หมด" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }

    const aiData = await aiRes.json();
    logTokenUsage(sb, { model: "google/gemini-2.5-flash", source: "teach-from-chat", apiResponse: aiData, customerId });
    const content = aiData?.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { items: [], diagnosis: "" }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("teach-from-chat error:", e);
    return new Response(JSON.stringify({ error: e.message || "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
