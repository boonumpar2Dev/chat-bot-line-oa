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

const SYSTEM_PROMPT = `คุณคือผู้ช่วยจัดระเบียบความรู้ AI สำหรับธุรกิจ ผู้ใช้พิมพ์ข้อความภาษาธรรมดามาให้ คุณต้องวิเคราะห์ว่าควรเก็บเป็น "กฎ" หรือ "ฐานความรู้" และ**เช็กก่อนเสมอว่ามีของเดิมที่พูดเรื่องเดียวกันอยู่หรือไม่ ถ้ามี → อัปเดตของเดิม อย่าสร้างซ้ำ**

เกณฑ์ตัดสิน type:
- **rule (กฎ AI)**: คำสั่ง ห้าม/ต้อง/อย่า/วิธีคุย/รูปแบบตอบ ที่ AI ต้องใช้ทุกครั้ง
- **knowledge (ฐานความรู้)**: ข้อมูล/ตัวเลข/ราคา/รายการ/FAQ ที่ใช้ตอบเมื่อลูกค้าถาม
- ก้ำกึ่ง → "ถ้าไม่ใส่ทุกครั้ง AI จะพลาดไหม" ถ้าใช่ = rule

เกณฑ์ action (สำคัญมาก):
- **update**: ของเดิมพูดเรื่อง/หัวข้อ/concept เดียวกัน (เช่น ค่าส่งเหมือนกันแต่ตัวเลขต่าง, เมนูชุดเดียวกันแต่เพิ่มรายการ, กฎเรื่องเดียวกันแต่ปรับ wording) → รวม/แทนที่ของเดิม
  - knowledge: ใส่ target_id เป็น id ของ knowledge_base เดิม + content ใหม่ต้องเป็นเนื้อหาที่ merge แล้วสมบูรณ์ (ไม่ใช่แค่ส่วนต่าง)
  - rule: ใส่ target_rule_index เป็นเลข index (เริ่ม 0) ของ rule เดิม + content ใหม่คือ rule ที่แก้แล้ว
- **create**: ไม่มีของเดิมที่เกี่ยวข้อง → เพิ่มใหม่

กฎการ refine:
- rule: สั้น action-oriented เริ่ม "ห้าม..." / "ต้อง..." / "เมื่อ X → Y" ≤2 บรรทัด
- knowledge: title ≤30 ตัว + content bullet ถ้าหลายข้อ + category จาก existing ถ้าตรง
- ข้อความยาวหลายเรื่อง → แตกเป็นหลาย item (แต่ละ item ตัดสิน action แยกกัน)

ตอบ JSON เท่านั้น:
{
  "items": [{
    "action": "create" | "update",
    "type": "rule" | "knowledge",
    "content": "เนื้อหาสุดท้าย (ถ้า update = เนื้อหา merge แล้ว)",
    "title": "(knowledge เท่านั้น)",
    "category": "(knowledge เท่านั้น)",
    "target_id": "(update+knowledge เท่านั้น — uuid ของ kb เดิม)",
    "target_rule_index": 0,
    "original_snippet": "(update เท่านั้น — ของเดิมย่อ ≤80 ตัว ให้ user เทียบ)",
    "reasoning": "เหตุผล 1 ประโยค"
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
    logTokenUsage(sb, { model: "google/gemini-2.5-flash", source: "classify", apiResponse: aiData });
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
