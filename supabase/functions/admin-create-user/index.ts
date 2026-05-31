import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "missing token" }, 401);

    // Verify caller is admin
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const callerRoles = (roleRows || []).map((r: any) => r.role);
    const isOwner = callerRoles.includes("owner");
    const isAdmin = callerRoles.includes("admin");
    if (!isOwner && !isAdmin) return json({ error: "admin only" }, 403);

    const body = await req.json();
    const { email, password, display_name, role, menu_keys } = body || {};
    if (!email || !password || !role) return json({ error: "email, password, role required" }, 400);
    if (typeof password !== "string" || password.length < 6) return json({ error: "password ≥ 6 chars" }, 400);
    if (!["owner", "admin", "manager", "staff"].includes(role)) return json({ error: "invalid role" }, 400);
    if (role === "owner" && !isOwner) return json({ error: "only owner can create owner" }, 403);

    // Create user (auto-confirmed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || email.split("@")[0] },
    });
    if (createErr || !created.user) return json({ error: createErr?.message || "create failed" }, 400);
    const newId = created.user.id;

    // Overwrite role (trigger handle_new_user inserted default)
    await admin.from("user_roles").delete().eq("user_id", newId);
    await admin.from("user_roles").insert({ user_id: newId, role });

    // Insert menu permissions
    if (Array.isArray(menu_keys)) {
      await admin.from("user_menu_permissions").upsert({ user_id: newId, menu_keys }, { onConflict: "user_id" });
    }

    return json({ ok: true, user_id: newId });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
