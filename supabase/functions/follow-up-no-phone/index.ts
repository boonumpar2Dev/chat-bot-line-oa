import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getLineConfig } from "../_shared/line-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: customers } = await admin
      .from("customers")
      .select("*")
      .eq("status", "new")
      .is("phone", null)
      .eq("ai_active", true);

    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    let sentCount = 0;

    for (const cust of customers || []) {
      if (cust.manual_chat_until && new Date(cust.manual_chat_until) > new Date()) continue;
      if (!cust.last_message_at || cust.last_message_at > cutoff) continue;

      const { data: recent } = await admin
        .from("conversations")
        .select("sender")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (recent?.[0]?.sender === "ai") continue;

      const name = cust.nickname || "คุณลูกค้า";
      const text = `สวัสดีครับ ${name} 😊\n\nยังสนใจเรื่องจัดเลี้ยงอยู่ไหมครับ?\n\nถ้าสะดวก รบกวนฝากเบอร์โทรไว้ได้เลยนะครับ จะให้เจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดแพ็กเกจและคิวงานโดยตรงเลยครับ 🙏`;

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

    return Response.json({ ok: true, sent: sentCount }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
