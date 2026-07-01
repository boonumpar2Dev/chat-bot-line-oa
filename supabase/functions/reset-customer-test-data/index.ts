import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user via JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check role: owner or admin only
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles || []).some((r: any) => r.role === "owner" || r.role === "admin");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "forbidden: owner/admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const customerId = body?.customer_id;
    const confirmation = body?.confirmation;
    if (!customerId || typeof customerId !== "string") {
      return new Response(JSON.stringify({ error: "customer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (confirmation !== "RESET") {
      return new Response(JSON.stringify({ error: "confirmation must be 'RESET'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify customer exists
    const { data: existing, error: existErr } = await admin
      .from("customers").select("id, line_user_id, display_name").eq("id", customerId).maybeSingle();
    if (existErr || !existing) {
      return new Response(JSON.stringify({ error: "customer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};

    // DELETE dependent rows
    const deletes = [
      "conversations",
      "customer_events",
      "customer_status_log",
      "ai_delivery_logs",
      "ai_reply_audit",
    ];
    for (const t of deletes) {
      const { error, count } = await admin.from(t).delete({ count: "exact" }).eq("customer_id", customerId);
      results[`deleted_${t}`] = error ? { error: error.message } : count;
    }

    // RESET customer row (KEEP: id, line_user_id, display_name, picture_url, created_at)
    const resetPatch: Record<string, any> = {
      nickname: null,
      phone: null,
      status: "new",
      ai_active: true,
      manual_chat_until: null,
      ai_resumed_at: null,
      tags: [],
      event_type: null,
      event_month: null,
      event_date: null,
      guest_count: null,
      contact_year: null,
      venue: null,
      clv_amount: 0,
      sla_deadline: null,
      last_sent_image_titles: [],
      unread_count: 0,
      last_message_at: null,
      last_message_snippet: null,
      admin_notes: null,
      tax_id: null,
      conversation_summary: null,
      summary_until_message_id: null,
      phone_saved_at: null,
      intent_data: {},
      tier: null,
      customer_notes: [],
      last_sender: null,
      admin_seen_at: null,
      admin_unseen: null,
      admin_bot_override: false,
      customer_origin: "new",
      updated_at: new Date().toISOString(),
    };
    const { error: updErr } = await admin
      .from("customers").update(resetPatch).eq("id", customerId);
    if (updErr) {
      return new Response(JSON.stringify({ error: `reset failed: ${updErr.message}`, results }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    results.reset_customer = true;

    return new Response(JSON.stringify({ ok: true, customer_id: customerId, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
