// Helper: ดึงค่า LINE config จาก DB (fallback ไป env ถ้า DB ว่าง)
// Cache สั้นๆ 60s กันยิง DB ทุก request

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type LineCfg = { channel_access_token: string; channel_secret: string; channel_id: string };

let cache: { val: LineCfg; at: number } | null = null;
const TTL_MS = 60_000;

export async function getLineConfig(forceRefresh = false): Promise<LineCfg> {
  if (!forceRefresh && cache && Date.now() - cache.at < TTL_MS) return cache.val;

  const envFallback: LineCfg = {
    channel_access_token: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "",
    channel_secret: Deno.env.get("LINE_CHANNEL_SECRET") ?? "",
    channel_id: "",
  };

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("line_config")
      .select("channel_access_token, channel_secret, channel_id")
      .eq("id", 1)
      .maybeSingle();

    const val: LineCfg = {
      channel_access_token: data?.channel_access_token?.trim() || envFallback.channel_access_token,
      channel_secret: data?.channel_secret?.trim() || envFallback.channel_secret,
      channel_id: data?.channel_id?.trim() || envFallback.channel_id,
    };
    cache = { val, at: Date.now() };
    return val;
  } catch (e) {
    console.error("[getLineConfig] fallback to env:", (e as Error).message);
    return envFallback;
  }
}

export function clearLineConfigCache() { cache = null; }
