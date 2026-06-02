import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getLineConfig } from "../_shared/line-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_KEY = Deno.env.get("LOVABLE_API_KEY");

async function generateFollowupText(opts: {
  instruction: string;
  nickname: string;
  persona?: string;
  history: { sender: string; message: string }[];
  customer: any;
}): Promise<string | null> {
  if (!LOVABLE_AI_KEY) return null;
  const { instruction, nickname, persona, history, customer } = opts;

  const ctxLines: string[] = [];
  if (customer.event_type) ctxLines.push(`- ประเภทงาน: ${customer.event_type}`);
  if (customer.event_date) ctxLines.push(`- วันจัดงาน: ${customer.event_date}`);
  if (customer.event_month) ctxLines.push(`- เดือนงาน: ${customer.event_month}`);
  if (customer.guest_count) ctxLines.push(`- จำนวนแขก: ${customer.guest_count}`);
  if (customer.venue) ctxLines.push(`- สถานที่: ${customer.venue}`);

  const chatLog = history
    .slice(-12)
    .map((c) => `${c.sender === "user" ? "ลูกค้า" : "AI"}: ${(c.message || "").slice(0, 200)}`)
    .join("\n");

  const sys = `${persona || "คุณคือผู้ช่วยร้านจัดเลี้ยง พูดสุภาพ เป็นกันเอง"}

หน้าที่ตอนนี้: เขียนข้อความ "ติดตามลูกค้า" ที่เงียบไปนานแล้ว 1 ข้อความสั้นๆ
แนวทาง: ${instruction}

ข้อมูลลูกค้าที่รู้:
- ชื่อเล่น: ${nickname}
${ctxLines.join("\n") || "- (ยังไม่มีข้อมูลงาน)"}

ประวัติแชทล่าสุด:
${chatLog || "(ไม่มี)"}

กฎเด็ดขาด:
- ตอบสั้นไม่เกิน 3 บรรทัด
- อ้างอิงสิ่งที่ลูกค้าเคยพูดถึงจริง ห้ามแต่งข้อมูลใหม่
- ห้ามถามซ้ำสิ่งที่ลูกค้าตอบไปแล้ว
- ห้ามใส่คำว่า "AI:" หรือ prefix อื่นๆ — ตอบเป็นข้อความเปล่าๆ
- ห้ามตื๊อ น้ำเสียงต้องนุ่ม`;

  try {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_AI_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: "เขียนข้อความติดตามลูกค้าได้เลย" },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[follow-up] AI gateway error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    console.error("[follow-up] AI call failed", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfgArr } = await admin.from("app_settings").select("*").eq("key", "ai_config").limit(1);
    const cfg = cfgArr?.[0] || {};
    if (cfg.followup_enabled === false) {
      return Response.json({ ok: true, skipped: true }, { headers: corsHeaders });
    }
    const followupHours = cfg.followup_hours || 2;
    const cutoff = new Date(Date.now() - followupHours * 3600000).toISOString();
    const instruction: string =
      (cfg.followup_instruction && String(cfg.followup_instruction).trim()) ||
      'ทักลูกค้าแบบสุภาพ สั้น อ้างอิงสิ่งที่คุยไว้ ห้ามตื๊อ';

    const { data: customers } = await admin
      .from("customers")
      .select("*")
      .eq("status", "new")
      .is("phone", null)
      .eq("ai_active", true);

    const accessToken = (await getLineConfig()).channel_access_token;
    let sentCount = 0;
    let aiCount = 0;
    let fallbackCount = 0;

    for (const cust of customers || []) {
      if (cust.manual_chat_until && new Date(cust.manual_chat_until) > new Date()) continue;
      if (!cust.last_message_at || cust.last_message_at > cutoff) continue;

      const { data: recent } = await admin
        .from("conversations")
        .select("sender, message, created_at")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (recent?.[0]?.sender === "ai") continue;

      const name = cust.nickname || "คุณลูกค้า";
      const history = (recent || []).slice().reverse().map((r: any) => ({ sender: r.sender, message: r.message }));

      let text = await generateFollowupText({
        instruction,
        nickname: name,
        persona: cfg.persona,
        history,
        customer: cust,
      });

      if (text) {
        aiCount++;
      } else {
        // fallback ถ้า AI ใช้ไม่ได้
        text = `สวัสดีครับ ${name} 😊\n\nยังสนใจเรื่องจัดเลี้ยงอยู่ไหมครับ? ถ้าสะดวก รบกวนฝากเบอร์โทรไว้ได้เลยนะครับ จะให้เจ้าหน้าที่ติดต่อกลับไปแจ้งรายละเอียดครับ 🙏`;
        fallbackCount++;
      }

      const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to: cust.line_user_id, messages: [{ type: "text", text }] }),
      });

      if (pushRes.ok) {
        await admin.from("conversations").insert({ customer_id: cust.id, message: text, sender: "ai" });
        await admin.from("customers").update({
          last_message_at: new Date().toISOString(),
          last_message_snippet: `🤖 ${text.slice(0, 60)}`,
        }).eq("id", cust.id);
        sentCount++;
      }
    }

    return Response.json({ ok: true, sent: sentCount, ai_generated: aiCount, fallback: fallbackCount }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
