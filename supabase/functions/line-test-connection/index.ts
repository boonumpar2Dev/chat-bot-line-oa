// ทดสอบ token ที่ admin กรอก โดยเรียก LINE bot info API
// รับ token (optional) — ถ้าไม่ส่งมาใช้ค่าใน DB
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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });

    const { token } = await req.json().catch(() => ({}));
    let useToken = (token as string | undefined)?.trim();
    if (!useToken) {
      const { data } = await admin.from("line_config").select("channel_access_token").eq("id", 1).maybeSingle();
      useToken = data?.channel_access_token?.trim();
    }
    if (!useToken) return Response.json({ ok: false, error: "ยังไม่ได้ตั้งค่า Channel Access Token" }, { headers: corsHeaders });

    const r = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${useToken}` },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, error: body?.message || "Token ไม่ถูกต้องหรือหมดอายุ" }, { headers: corsHeaders });
    }
    return Response.json({ ok: true, bot: body }, { headers: corsHeaders });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: corsHeaders });
  }
});
