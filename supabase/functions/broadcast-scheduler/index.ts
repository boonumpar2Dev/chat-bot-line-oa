// Cron: trigger scheduled broadcast campaigns + retry stuck "sending" ones
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireStaffOrService } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const __auth = await requireStaffOrService(req);
  if (!__auth.ok) return Response.json({ error: __auth.error }, { status: __auth.status || 401, headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 90_000).toISOString(); // stuck > 90s

    // 1) due scheduled
    const { data: due } = await admin
      .from("broadcast_campaigns")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(20);

    // 2) stuck "sending" with 0 recipients (invoke was aborted/never reached)
    const { data: stuck } = await admin
      .from("broadcast_campaigns")
      .select("id, updated_at, total_recipients")
      .eq("status", "sending")
      .eq("total_recipients", 0)
      .lt("updated_at", staleIso)
      .limit(10);

    const ids = [
      ...((due || []).map((c) => c.id)),
      ...((stuck || []).map((c) => c.id)),
    ];

    const triggered: string[] = [];
    for (const id of ids) {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/broadcast-send`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ campaign_id: id }),
      }).catch((e) => console.error("[scheduler] invoke fail:", id, e));
      triggered.push(id);
    }

    return Response.json({ ok: true, triggered: triggered.length, ids: triggered }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("[broadcast-scheduler]", err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
