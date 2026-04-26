import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("customers")
      .update({ ai_active: true, manual_chat_until: null, ai_resumed_at: now })
      .lte("manual_chat_until", now)
      .not("manual_chat_until", "is", null)
      .select("id");
    if (error) throw error;
    return Response.json({ ok: true, expired_count: data?.length || 0 }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
