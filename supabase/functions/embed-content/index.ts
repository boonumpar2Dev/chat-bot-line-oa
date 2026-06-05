// Embed knowledge_base / catering_packages / promotions rows using Lovable AI Gateway.
// Modes:
//   { table, id }             → embed single row
//   { table, ids: [...] }     → embed batch
//   { rebuild: true }         → re-embed every active row in all 3 tables
//   { text: "..." }           → just return an embedding for ad-hoc query (used internally)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;

const ALLOWED_TABLES = new Set(["knowledge_base", "catering_packages", "promotions"]);

function buildText(table: string, row: any): string {
  if (table === "knowledge_base") {
    return [row.title, row.category, row.content].filter(Boolean).join("\n");
  }
  if (table === "catering_packages") {
    const tiers = Array.isArray(row.pricing_tiers)
      ? row.pricing_tiers.map((t: any) => `${t.tier_name || ""} ${t.price || ""} ${t.description || ""}`).join(" | ")
      : "";
    return [row.name, row.category, row.description, row.min_condition, row.ai_instruction, row.notes, tiers]
      .filter(Boolean).join("\n");
  }
  if (table === "promotions") {
    return [row.name, row.description, (row.applicable_categories || []).join(", ")].filter(Boolean).join("\n");
  }
  return "";
}

async function embedText(text: string): Promise<number[]> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`embedding ${r.status}: ${body}`);
  }
  const j = await r.json();
  return j.data[0].embedding as number[];
}

async function embedRow(supabase: any, table: string, id: string): Promise<{ id: string; ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
    if (error || !data) return { id, ok: false, error: error?.message || "not found" };
    const text = buildText(table, data).trim();
    if (!text) return { id, ok: false, error: "empty text" };
    const vec = await embedText(text);
    const { error: upErr } = await supabase
      .from(table)
      .update({ embedding: vec as any, embedding_text: text, embedded_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) return { id, ok: false, error: upErr.message };
    return { id, ok: true };
  } catch (e: any) {
    return { id, ok: false, error: e?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ad-hoc text → return embedding (used by line-webhook for query)
    if (body.text && typeof body.text === "string") {
      const vec = await embedText(body.text);
      return Response.json({ embedding: vec }, { headers: corsHeaders });
    }

    // Rebuild everything
    if (body.rebuild) {
      const tables = ["knowledge_base", "catering_packages", "promotions"];
      const results: any = {};
      for (const t of tables) {
        const filter = t === "knowledge_base" ? { col: "status", val: "active" } : { col: "is_active", val: true };
        const { data: rows } = await supabase.from(t).select("id").eq(filter.col, filter.val);
        let ok = 0, fail = 0;
        for (const r of (rows || [])) {
          const res = await embedRow(supabase, t, r.id);
          if (res.ok) ok++; else fail++;
        }
        results[t] = { ok, fail, total: (rows || []).length };
      }
      return Response.json({ rebuild: true, results }, { headers: corsHeaders });
    }

    const table = body.table;
    if (!table || !ALLOWED_TABLES.has(table)) {
      return new Response(JSON.stringify({ error: "invalid table" }), { status: 400, headers: corsHeaders });
    }
    const ids: string[] = body.ids || (body.id ? [body.id] : []);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: "no ids" }), { status: 400, headers: corsHeaders });
    }
    const results = [];
    for (const id of ids) {
      results.push(await embedRow(supabase, table, id));
    }
    return Response.json({ results }, { headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: corsHeaders });
  }
});
