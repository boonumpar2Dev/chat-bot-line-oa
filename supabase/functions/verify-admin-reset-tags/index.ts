import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Caller must be logged in (any staff) — we still re-verify with email/password below
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) return json({ error: "email และ password จำเป็น" }, 400);

    // 2) Verify email+password using a temp anon client (does not affect caller session)
    const verifier = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signErr } = await verifier.auth.signInWithPassword({ email, password });
    if (signErr || !signIn?.user) {
      return json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    const verifiedUserId = signIn.user.id;
    // Best-effort sign out the verifier session
    try { await verifier.auth.signOut(); } catch (_) { /* ignore */ }

    // 3) Check verified user has owner or admin role
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", verifiedUserId);
    const allowed = (roles || []).some((r: any) => r.role === "owner" || r.role === "admin");
    if (!allowed) {
      return json({ error: "ผู้ยืนยันต้องเป็น Owner หรือ Admin เท่านั้น" }, 403);
    }

    // 4) Run reset
    const { data: affected, error: rpcErr } = await admin.rpc("rescan_auto_tags", { _mode: "reset" });
    if (rpcErr) return json({ error: rpcErr.message }, 500);

    return json({ ok: true, affected: affected ?? 0, verified_by: email });
  } catch (e: any) {
    return json({ error: e?.message || "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
