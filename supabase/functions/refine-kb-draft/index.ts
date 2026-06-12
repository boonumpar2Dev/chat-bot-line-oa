// Refine a raw Q/A snippet from chat into a clean KB entry
// + warn if similar KB already exists
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

const SYSTEM_PROMPT = `คุณคือ AI ช่วยเรียบเรียงข้อมูลเข้า Knowledge Base ของบอทขายงานจัดเลี้ยง
หน้าที่: รับ Q/A ดิบจากแชท + บริบทบทสนทนา → เรียบเรียงเป็น KB entry ที่ AI ใช้ได้ดี

หลักการ:
- title: สั้นชัด ≤30 ตัวอักษร ตรงประเด็น (เช่น "ส่วนลดเมื่อไม่รับสังฆทาน", "ค่าส่งต่างจังหวัด")
- q: คำถามมาตรฐานที่ลูกค้าน่าจะถาม (clean ภาษา, ตัดสรรพนามเฉพาะลูกค้าออก เช่น ชื่อ/เบอร์)
- a: คำตอบกระชับเป็นกลาง ใช้กับลูกค้าทุกคนได้ (เอาเบอร์/ชื่อแอดมินเฉพาะคนออกถ้ามี, เก็บนโยบาย/ราคา/เงื่อนไข)
- category: เลือกจาก existing_categories ที่ใกล้สุด, ถ้าไม่มีเหมาะให้ส่ง ""
- diagnosis: 1-2 ประโยค บอกว่าเข้า KB กลางเหมาะไหม หรือเป็นเรื่องเฉพาะลูกค้าควรเป็นโน้ตแทน
- is_general: true ถ้าเหมาะเป็น KB กลาง, false ถ้าเฉพาะลูกค้าคนเดียว (แอดมินจะเห็นคำเตือน)

ตอบ JSON เท่านั้น:
{
  "title": "...",
  "q": "...",
  "a": "...",
  "category": "...",
  "diagnosis": "...",
  "is_general": true | false
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const customerId: string = body.customer_id;
    const rawQ: string = String(body.raw_q || "").slice(0, 1000);
    const rawA: string = String(body.raw_a || "").slice(0, 2000);
    const feedback: string = String(body.feedback || "").slice(0, 500);

    if (!rawA.trim()) {
      return new Response(JSON.stringify({ error: "missing raw_a" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch transcript (last ~20 msgs), categories, existing KB titles
    const [{ data: msgs }, { data: cats }, { data: kb }] = await Promise.all([
      customerId
        ? sb.from("conversations")
            .select("sender, message, created_at")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as any[] }),
      sb.from("knowledge_categories").select("name").order("sort_order"),
      sb.from("knowledge_base").select("id, title, content").eq("status", "active").limit(300),
    ]);

    const chronological = (msgs || []).slice().reverse();
    const transcript = chronological.map((m: any) => {
      const who = m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI";
      const clean = String(m.message || "").replace(/https?:\/\/\S+/g, "[link]").slice(0, 300);
      return `${who}: ${clean}`;
    }).join("\n");

    const userPrompt = `=== บริบทบทสนทนาล่าสุด ===
${transcript || "(ไม่มี)"}

=== Q/A ดิบที่จะเข้า KB ===
Q (จากลูกค้า): ${rawQ || "(ว่าง — อนุมานจากบริบท)"}
A (แอดมินตอบ): ${rawA}

${feedback ? `=== หมายเหตุจากแอดมิน ===\n${feedback}\n` : ""}
existing_categories: ${(cats || []).map((c: any) => c.name).join(", ") || "(ไม่มี)"}

กรุณาเรียบเรียงเป็น KB entry + วินิจฉัยว่าเหมาะเป็น KB กลางไหม`;

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
    logTokenUsage(sb, { model: "google/gemini-2.5-flash", source: "refine-kb-draft", apiResponse: aiData, customerId });
    const content = aiData?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    // Find similar existing KB by simple token overlap on title + first 200 chars
    const refTitle: string = String(parsed.title || "").toLowerCase();
    const refContent: string = (String(parsed.q || "") + " " + String(parsed.a || "")).toLowerCase();
    const refTokens = new Set(
      (refTitle + " " + refContent).split(/[\s,.\n]+/).filter((w) => w.length >= 3)
    );
    const similar = (kb || []).map((k: any) => {
      const t = (String(k.title || "") + " " + String(k.content || "")).toLowerCase();
      const tokens = new Set(t.split(/[\s,.\n]+/).filter((w) => w.length >= 3));
      let hit = 0;
      refTokens.forEach((w) => { if (tokens.has(w)) hit++; });
      const score = refTokens.size > 0 ? hit / refTokens.size : 0;
      return { id: k.id, title: k.title, score };
    })
      .filter((x) => x.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return new Response(JSON.stringify({
      title: parsed.title || "",
      q: parsed.q || rawQ,
      a: parsed.a || rawA,
      category: parsed.category || "",
      diagnosis: parsed.diagnosis || "",
      is_general: parsed.is_general !== false,
      similar,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("refine-kb-draft error:", e);
    return new Response(JSON.stringify({ error: e.message || "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
