import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing token" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "admin only" }, 403);

    const body = await req.json();
    const { user_id, email, password, display_name } = body || {};
    if (!user_id) return json({ error: "user_id required" }, 400);

    const updates: any = {};
    if (email && typeof email === "string") updates.email = email.trim();
    if (password && typeof password === "string") {
      if (password.length < 6) return json({ error: "password ≥ 6 chars" }, 400);
      updates.password = password;
    }
    if (display_name !== undefined) {
      updates.user_metadata = { display_name: display_name || "" };
    }

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await admin.auth.admin.updateUserById(user_id, updates);
      if (updErr) return json({ error: updErr.message }, 400);
    }

    if (display_name !== undefined || email) {
      const profilePatch: any = {};
      if (display_name !== undefined) profilePatch.display_name = display_name || null;
      if (email) profilePatch.email = email.trim();
      if (Object.keys(profilePatch).length > 0) {
        await admin.from("profiles").update(profilePatch).eq("id", user_id);
      }
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
