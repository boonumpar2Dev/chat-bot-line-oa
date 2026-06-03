// Cron: trigger scheduled broadcast campaigns
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from("broadcast_campaigns")
      .select("id, name, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(20);

    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    const triggered: string[] = [];
    for (const c of (due || [])) {
      // Invoke broadcast-send (fire and forget)
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/broadcast-send`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ campaign_id: c.id }),
      }).catch((e) => console.error("[scheduler] invoke fail:", c.id, e));
      triggered.push(c.id);
    }

    return Response.json({ ok: true, triggered: triggered.length, ids: triggered }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("[broadcast-scheduler]", err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
