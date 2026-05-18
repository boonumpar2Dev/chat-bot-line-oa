import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildKbBlock, buildPackageBlock, buildPromoBlock, countTokens } from "../_shared/ai-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: kb }, { data: pkgs }, { data: promos }] = await Promise.all([
      supabase.from("knowledge_base").select("*").eq("status", "active").order("sort_order", { ascending: true }),
      supabase.from("catering_packages").select("*").eq("is_active", true),
      supabase.from("promotions").select("*").eq("is_active", true),
    ]);

    const blocks = [
      { key: "kb_summary", content: buildKbBlock(kb || []), count: (kb || []).length },
      { key: "packages_summary", content: buildPackageBlock(pkgs || []), count: (pkgs || []).length },
      { key: "promotions_summary", content: buildPromoBlock(promos || []), count: (promos || []).length },
    ];

    const results: any[] = [];
    for (const b of blocks) {
      const tokens = countTokens(b.content);
      const { error } = await supabase.from("ai_context_cache").upsert({
        key: b.key,
        content: b.content,
        token_count: tokens,
        meta: { item_count: b.count },
        updated_at: new Date().toISOString(),
      });
      if (error) console.error(`[rebuild] ${b.key} upsert error:`, error);
      results.push({ key: b.key, tokens, items: b.count });
    }

    return Response.json({ ok: true, results }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("rebuild-ai-cache error:", e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: corsHeaders });
  }
});
