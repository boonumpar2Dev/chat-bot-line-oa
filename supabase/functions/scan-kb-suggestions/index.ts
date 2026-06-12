// Scan admin replies in a date range → cluster by embedding similarity → AI summarize → insert kb_suggestions (pending)
// Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", strictness: "strict"|"medium"|"loose" }
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
const CHAT_MODEL = "google/gemini-2.5-flash";
const MAX_CLUSTERS_PER_SCAN = 30;

type Strictness = "strict" | "medium" | "loose";
type StrictCfg = { simThreshold: number; minOccurrences: number; minCustomers: number; kbDupSim: number };
const STRICT_PRESETS: Record<Strictness, StrictCfg> = {
  strict: { simThreshold: 0.90, minOccurrences: 20, minCustomers: 4, kbDupSim: 0.88 },
  medium: { simThreshold: 0.85, minOccurrences: 10, minCustomers: 3, kbDupSim: 0.85 },
  loose:  { simThreshold: 0.78, minOccurrences: 5,  minCustomers: 2, kbDupSim: 0.82 },
};

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  // OpenAI-compatible: input can be string[]
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  // Sort by index to be safe
  const sorted = (j.data as any[]).sort((a, b) => a.index - b.index);
  return sorted.map((d: any) => d.embedding as number[]);
}

async function aiSummarizeCluster(samples: { q: string; a: string }[]): Promise<{ q: string; a: string; skip?: boolean; reason?: string } | null> {
  const examples = samples.slice(0, 8).map((s, i) => `${i+1}. ลูกค้าถาม: ${s.q || "(ไม่มี)"}\n   แอดมินตอบ: ${s.a}`).join("\n\n");
  const sysPrompt = `คุณช่วยจัดความรู้สำหรับ AI chatbot ของร้านจัดเลี้ยง
ภารกิจ: ดูตัวอย่างที่แอดมินตอบลูกค้า → สรุปเป็น Q/A สะอาดที่ AI ใช้ตอบครั้งหน้าได้
กฎ:
- ถ้าเป็นแค่ทักทาย/ตอบสั้นทั่วไป (เช่น "ค่ะ", "ขอบคุณ", "สวัสดีค่ะ") → set "skip": true
- ถ้าเป็นข้อมูลเฉพาะลูกค้ารายเดียว (เช่น เลขบัญชี, ที่อยู่ของลูกค้า) → set "skip": true
- ถ้าเป็นข้อมูลทั่วไปที่ใช้ตอบคนอื่นได้ → สรุป q (ภาษาธรรมชาติที่ลูกค้าน่าจะถาม) + a (คำตอบสั้น กระชับ)
- ตอบเป็น JSON เท่านั้น`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: `ตัวอย่าง:\n\n${examples}\n\nตอบ JSON: {"q":"...","a":"...","skip":false}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    console.warn(`[ai] cluster summarize ${r.status}: ${await r.text()}`);
    return null;
  }
  const j = await r.json();
  try {
    const content = j.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // role check
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const role = roleRow?.role;
    if (!["admin","manager","owner"].includes(role || "")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    const strictness = (["strict","medium","loose"].includes(body.strictness) ? body.strictness : "medium") as Strictness;
    if (!from || !to) return new Response(JSON.stringify({ error: "from/to required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cfg = STRICT_PRESETS[strictness];

    // 1) fetch admin messages + previous customer message per conversation
    //    use a window: get all msgs in [from, to+1day) ordered by customer then time
    const fromISO = new Date(`${from}T00:00:00+07:00`).toISOString();
    const toISO = new Date(`${to}T23:59:59+07:00`).toISOString();

    const { data: msgs, error: mErr } = await sb
      .from("conversations")
      .select("id, customer_id, message, sender, created_at")
      .gte("created_at", fromISO).lte("created_at", toISO)
      .order("customer_id", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5000);
    if (mErr) throw mErr;

    type AdminItem = { id: string; customer_id: string; q: string; a: string; created_at: string };
    const adminItems: AdminItem[] = [];
    for (let i = 0; i < (msgs?.length || 0); i++) {
      const m = msgs![i];
      if (m.sender !== "admin") continue;
      const text = String(m.message || "").trim();
      if (text.length < 8 || text.length > 600) continue; // skip very short or very long
      // find previous customer msg in same customer
      let q = "";
      for (let j = i - 1; j >= 0; j--) {
        if (msgs![j].customer_id !== m.customer_id) break;
        if (msgs![j].sender === "customer") { q = String(msgs![j].message || "").trim(); break; }
      }
      adminItems.push({ id: m.id, customer_id: m.customer_id, q, a: text, created_at: m.created_at });
    }

    if (!adminItems.length) {
      await sb.from("app_settings").update({ kb_suggest_last_scan_at: new Date().toISOString(), kb_suggest_strictness: strictness }).eq("key", "ai_config");
      return new Response(JSON.stringify({ ok: true, clusters: 0, suggestions: 0, scanned: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Embed by TOPIC (customer question first, then admin answer) — so "ส่งต่างจังหวัดได้ไหม"
    //    และ "ไปอุดรมั้ย" จับเป็น cluster เดียว แม้แอดมินจะตอบคนละสำนวน
    const allEmbeds: number[][] = [];
    const BATCH = 50;
    for (let i = 0; i < adminItems.length; i += BATCH) {
      const slice = adminItems.slice(i, i + BATCH);
      const texts = slice.map((x) => {
        const q = (x.q || "").slice(0, 300);
        const a = (x.a || "").slice(0, 300);
        // เน้น q (เรื่องที่ลูกค้าถาม) — ทวน q ก่อน เพื่อให้ embedding ให้น้ำหนัก
        return q ? `คำถาม: ${q}\nคำตอบ: ${a}` : `คำตอบ: ${a}`;
      });
      const vecs = await embedBatch(texts);
      allEmbeds.push(...vecs);
    }

    // 3) Greedy cluster: for each item, attach to first cluster whose centroid is similar enough
    type Cluster = { idxs: number[]; centroid: number[] };
    const clusters: Cluster[] = [];
    for (let i = 0; i < adminItems.length; i++) {
      const v = allEmbeds[i];
      let placed = false;
      for (const c of clusters) {
        if (cosine(v, c.centroid) >= cfg.simThreshold) {
          c.idxs.push(i);
          // update centroid (running mean)
          for (let k = 0; k < c.centroid.length; k++) c.centroid[k] = (c.centroid[k] * (c.idxs.length - 1) + v[k]) / c.idxs.length;
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ idxs: [i], centroid: v.slice() });
    }

    // 4) Filter clusters by min occurrence + distinct customers
    const goodClusters = clusters
      .filter((c) => {
        const distinct = new Set(c.idxs.map((i) => adminItems[i].customer_id));
        return c.idxs.length >= cfg.minOccurrences && distinct.size >= cfg.minCustomers;
      })
      .sort((a, b) => b.idxs.length - a.idxs.length)
      .slice(0, MAX_CLUSTERS_PER_SCAN);

    // 5) For each cluster, check KB duplicate first (cheap) → if not, call AI summary
    const inserted: any[] = [];
    for (const c of goodClusters) {
      // Check vs existing KB using centroid embedding
      const { data: kbMatches } = await sb.rpc("match_knowledge_base", {
        query_embedding: c.centroid as any,
        match_count: 1,
        min_similarity: cfg.kbDupSim,
      });
      if (kbMatches && kbMatches.length > 0) continue; // already in KB

      // Check vs previously dismissed suggestions (text match)
      const samples = c.idxs.map((i) => ({ q: adminItems[i].q, a: adminItems[i].a }));
      const summary = await aiSummarizeCluster(samples);
      if (!summary || summary.skip || !summary.q || !summary.a) continue;

      // skip if same suggested_q already dismissed/pending
      const { data: dup } = await sb.from("kb_suggestions")
        .select("id").eq("suggested_q", summary.q).limit(1);
      if (dup && dup.length > 0) continue;

      const distinctCustomers = Array.from(new Set(c.idxs.map((i) => adminItems[i].customer_id)));
      const { data: ins, error: insErr } = await sb.from("kb_suggestions").insert({
        suggested_q: summary.q,
        suggested_a: summary.a,
        source_message_ids: c.idxs.map((i) => adminItems[i].id),
        customer_ids: distinctCustomers,
        occurrence_count: c.idxs.length,
        scan_from: from,
        scan_to: to,
        strictness,
        status: "pending",
      }).select("id").single();
      if (!insErr) inserted.push(ins);
    }

    await sb.from("app_settings").update({
      kb_suggest_last_scan_at: new Date().toISOString(),
      kb_suggest_strictness: strictness,
    }).eq("key", "ai_config");

    return new Response(JSON.stringify({
      ok: true,
      scanned: adminItems.length,
      clusters: clusters.length,
      goodClusters: goodClusters.length,
      suggestions: inserted.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[scan-kb-suggestions]", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
