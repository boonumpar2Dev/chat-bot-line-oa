// Smart teach box: AI classifies user input → rule vs KB → returns refined items
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logTokenUsage } from "../_shared/log-token-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `คุณคือผู้ช่วยจัดระเบียบความรู้ AI สำหรับธุรกิจ ผู้ใช้พิมพ์ข้อความภาษาธรรมดามาให้ คุณต้องวิเคราะห์ว่าควรเก็บเป็น "กฎ" หรือ "ฐานความรู้" และจัดให้พร้อมบันทึก

เกณฑ์ตัดสิน:
- **rule (กฎ AI)**: คำสั่ง ห้าม/ต้อง/อย่า/วิธีคุย/รูปแบบตอบ หรือ trigger ที่ AI ต้องตื่นตัวเสมอแม้ลูกค้าไม่ถาม (เช่น "ห้ามชวนลูกค้าต่างจังหวัดมาชิม", "ต่างจังหวัดต้องถามจังหวัดก่อนเสนอราคา", "ตอบสั้นไม่เกิน 2 ประโยค")
- **knowledge (ฐานความรู้)**: ข้อมูล/ตัวเลข/ราคา/รายการ/FAQ ที่ใช้ "ตอบเมื่อลูกค้าถาม" (เช่น "ค่าส่งกรุงเทพฟรี ต่างจังหวัด 15 บาท/กม.", "เมนูบุฟเฟ่ต์มี A B C")
- ถ้าก้ำกึ่ง → ตัดสินตามว่า "ถ้าไม่ใส่ใน prompt ทุกครั้ง AI จะพลาดไหม" ถ้าใช่ = rule

กฎการ refine:
- rule: เขียนสั้น ชัด action-oriented เริ่มด้วย "ห้าม..." / "ต้อง..." / "เมื่อ X → Y" ไม่เกิน 2 บรรทัด
- knowledge: ใส่ title สั้น (≤30 ตัวอักษร) + content แบบ bullet ถ้ามีหลายข้อ + เลือก category จาก existing ถ้าตรง ไม่งั้นใส่ category ใหม่
- ถ้าข้อความผู้ใช้ครอบคลุมหลายเรื่อง → แตกเป็นหลาย item

ตรวจ duplicate:
- เทียบกับ existing_rules / existing_kb_titles → ถ้าเจอที่ใกล้เคียงมาก (concept เดียวกัน) ใส่ similar: [{type, snippet}]

ตอบกลับเป็น JSON เท่านั้น:
{
  "items": [{
    "type": "rule" | "knowledge",
    "content": "ข้อความสุดท้ายที่จะบันทึก",
    "title": "(ถ้า knowledge)",
    "category": "(ถ้า knowledge เลือกจาก existing categories หรือชื่อใหม่)",
    "reasoning": "เหตุผลสั้น 1 ประโยค ทำไมจัดเป็นประเภทนี้",
    "similar": [{ "type": "rule"|"knowledge", "snippet": "..." }]
  }]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "ใส่ข้อความก่อนนะคะ" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [{ data: cfg }, { data: kb }, { data: cats }] = await Promise.all([
      sb.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle(),
      sb.from("knowledge_base").select("title").limit(200),
      sb.from("knowledge_categories").select("name").order("sort_order"),
    ]);

    const userPrompt = `ข้อความจากผู้ใช้:
"""
${text.trim()}
"""

existing_rules (${(cfg?.strict_rules || []).length} ข้อ):
${(cfg?.strict_rules || []).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") || "(ไม่มี)"}

existing_kb_titles:
${(kb || []).map((k: any) => `- ${k.title}`).join("\n") || "(ไม่มี)"}

existing_categories: ${(cats || []).map((c: any) => c.name).join(", ") || "(ไม่มี)"}

วิเคราะห์และตอบ JSON ตามฟอร์แมต`;

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
        return new Response(JSON.stringify({ error: "AI ทำงานหนักไปนิด รออีกครู่แล้วลองใหม่นะคะ" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI credits หมด — กรุณาเติมที่ Settings → Workspace → Usage" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error ${aiRes.status}: ${errText}`);
    }

    const aiData = await aiRes.json();
    logTokenUsage(supabase, { model: "google/gemini-2.5-flash", source: "classify", apiResponse: aiData });
    const content = aiData?.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { items: [] }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("classify-knowledge error:", e);
    return new Response(JSON.stringify({ error: e.message || "เกิดข้อผิดพลาด" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
