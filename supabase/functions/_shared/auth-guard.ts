// Shared auth guard for edge functions.
// Allows either:
//   1. Service-role bearer token (used by internal callers / pg_cron / function-to-function), OR
//   2. Authenticated staff user (owner/admin/manager/staff) via JWT
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface AuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  userId?: string;
  isServiceRole?: boolean;
}

export async function requireStaffOrService(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.slice(7).trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) {
    return { ok: true, isServiceRole: true };
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: isStaff } = await admin.rpc("is_staff_member", { _user_id: data.user.id });
    if (!isStaff) {
      return { ok: false, status: 403, error: "Forbidden: staff only" };
    }
    return { ok: true, userId: data.user.id };
  } catch (_e) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
}
