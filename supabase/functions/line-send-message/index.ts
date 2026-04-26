import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const { line_user_id, message, messages, customer_id } = await req.json();
    if (!line_user_id) return Response.json({ error: "Missing line_user_id" }, { status: 400, headers: corsHeaders });

    const lineMessages = messages || (message ? [{ type: "text", text: message }] : null);
    if (!lineMessages) return Response.json({ error: "Missing message" }, { status: 400, headers: corsHeaders });

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")}`,
      },
      body: JSON.stringify({ to: line_user_id, messages: lineMessages }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("LINE push error:", err);
      return Response.json({ error: err }, { status: 400, headers: corsHeaders });
    }

    // Save admin message + start manual chat timer
    if (customer_id) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const text = lineMessages.map((m: any) => m.text || `[${m.type}]`).join("\n");
      const { data: cfgArr } = await admin.from("app_settings").select("manual_chat_hours").eq("key", "ai_config").limit(1);
      const manualHours = cfgArr?.[0]?.manual_chat_hours || 360;
      const until = new Date(Date.now() + manualHours * 3600000).toISOString();

      await admin.from("conversations").insert({ customer_id, message: text, sender: "admin" });
      await admin.from("customers").update({
        ai_active: false,
        manual_chat_until: until,
        last_message_at: new Date().toISOString(),
        last_message_snippet: `👤 ${text.slice(0, 60)}`,
        unread_count: 0,
      }).eq("id", customer_id);
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
