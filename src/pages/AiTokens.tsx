import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Zap, Eye, DollarSign, TrendingUp, MessageSquare, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";

const LABELS: Record<string, string> = {
  kb_summary: "ความรู้ (Knowledge Base)",
  packages_summary: "แพ็กเกจจัดเลี้ยง",
  promotions_summary: "โปรโมชั่น",
};

const SOURCE_LABELS: Record<string, string> = {
  webhook: "ตอบลูกค้า (LINE)",
  ocr: "อ่านรูป (OCR)",
  kb_test: "ทดสอบใน Knowledge",
  summarize: "สรุปบทสนทนา",
  classify: "Smart Teach",
};

const BUDGETS = [
  { name: "Knowledge Base", tokens: 3000 },
  { name: "Packages", tokens: 4500 },
  { name: "Promotions", tokens: 800 },
  { name: "History", tokens: 2000 },
];

// USD → THB อัตราโดยประมาณ (ปรับได้)
const USD_TO_THB = 36;

type UsageRow = {
  id: string;
  model: string;
  source: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
};

function fmtUsd(n: number) { return `$${n.toFixed(n < 0.01 ? 5 : n < 1 ? 4 : 2)}`; }
function fmtThb(n: number) { return `฿${(n * USD_TO_THB).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

export default function AiTokens() {
  const [cacheRows, setCacheRows] = useState<any[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [usage30, setUsage30] = useState<UsageRow[]>([]);
  const [allTime, setAllTime] = useState<{ cost: number; tokens: number; calls: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Date range (default = last 30 days)
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(daysAgoStr(30));
  const [toDate, setToDate] = useState<string>(todayStr());

  const loadUsageRange = async (from: string, to: string) => {
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59.999").toISOString();
    const { data } = await supabase.from("ai_token_usage")
      .select("id, model, source, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at")
      .gte("created_at", fromIso).lte("created_at", toIso)
      .order("created_at", { ascending: false }).limit(5000);
    setUsage((data || []) as UsageRow[]);
  };

  const load = async () => {
    setLoading(true);
    const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const [cacheRes, usage30Res, totalsRes] = await Promise.all([
      supabase.from("ai_context_cache").select("*").order("key"),
      supabase.from("ai_token_usage")
        .select("id, model, source, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at")
        .gte("created_at", since30).order("created_at", { ascending: false }).limit(5000),
      supabase.rpc("ai_token_usage_totals", { p_from: null, p_to: null }),
    ]);
    setCacheRows(cacheRes.data || []);
    setUsage30((usage30Res.data || []) as UsageRow[]);
    const t = (totalsRes.data as any)?.[0];
    setAllTime(t ? { cost: Number(t.total_cost) || 0, tokens: Number(t.total_tokens) || 0, calls: Number(t.total_calls) || 0 } : { cost: 0, tokens: 0, calls: 0 });
    await loadUsageRange(fromDate, toDate);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Re-load just the range table when dates change (after initial load)
  useEffect(() => {
    if (loading) return;
    loadUsageRange(fromDate, toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const rebuild = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("rebuild-ai-cache");
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Rebuild สำเร็จ");
    load();
  };

  const [busyEmbed, setBusyEmbed] = useState(false);
  const rebuildEmbeddings = async () => {
    if (!confirm("Re-generate embedding ของ KB / แพ็กเกจ / โปรโมชั่นทั้งหมด? (ใช้เวลา ~30-60 วินาที)")) return;
    setBusyEmbed(true);
    const { data, error } = await supabase.functions.invoke("embed-content", { body: { rebuild: true } });
    setBusyEmbed(false);
    if (error) toast.error(error.message);
    else {
      const r = (data as any)?.results || {};
      toast.success(`Embed สำเร็จ: KB ${r.knowledge_base?.ok || 0}/${r.knowledge_base?.total || 0} · Pkg ${r.catering_packages?.ok || 0}/${r.catering_packages?.total || 0} · Promo ${r.promotions?.ok || 0}/${r.promotions?.total || 0}`);
    }
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 3600_000;
    const buckets = { today: 0, d7: 0, d30: 0 } as Record<string, number>;
    const calls = { today: 0, d7: 0, d30: 0 } as Record<string, number>;
    const tokens = { today: 0, d7: 0, d30: 0 } as Record<string, number>;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    for (const r of usage30) {
      const t = new Date(r.created_at).getTime();
      const age = now - t;
      buckets.d30 += r.cost_usd; calls.d30++; tokens.d30 += r.total_tokens;
      if (age <= 7 * day) { buckets.d7 += r.cost_usd; calls.d7++; tokens.d7 += r.total_tokens; }
      if (t >= todayStart.getTime()) { buckets.today += r.cost_usd; calls.today++; tokens.today += r.total_tokens; }
    }
    return { cost: buckets, calls, tokens };
  }, [usage30]);

  const byModel = useMemo(() => {
    const map = new Map<string, { calls: number; prompt: number; completion: number; cost: number }>();
    for (const r of usage) {
      const k = r.model;
      const cur = map.get(k) || { calls: 0, prompt: 0, completion: 0, cost: 0 };
      cur.calls++; cur.prompt += r.prompt_tokens; cur.completion += r.completion_tokens; cur.cost += r.cost_usd;
      map.set(k, cur);
    }
    return Array.from(map.entries()).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost);
  }, [usage]);

  const bySource = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const r of usage) {
      const cur = map.get(r.source) || { calls: 0, tokens: 0, cost: 0 };
      cur.calls++; cur.tokens += r.total_tokens; cur.cost += r.cost_usd;
      map.set(r.source, cur);
    }
    return Array.from(map.entries()).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.cost - a.cost);
  }, [usage]);

  const cacheTotal = cacheRows.reduce((a, r) => a + (r.token_count || 0), 0);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1 flex items-center gap-2">
            <Zap className="text-primary"/> AI Tokens & ค่าใช้จ่าย
          </h1>
          <p className="text-muted-foreground">รายงานสำหรับผู้บริหาร — ติดตามต้นทุน AI ที่โดนเก็บเงินจริง</p>
        </div>
        <Button onClick={load} variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-1"/>รีเฟรช</Button>
      </div>

      {/* Cost summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "วันนี้", cost: stats.cost.today, calls: stats.calls.today, tokens: stats.tokens.today, gradient: true },
          { label: "7 วันที่ผ่านมา", cost: stats.cost.d7, calls: stats.calls.d7, tokens: stats.tokens.d7 },
          { label: "30 วันที่ผ่านมา", cost: stats.cost.d30, calls: stats.calls.d30, tokens: stats.tokens.d30 },
        ].map((s, i) => (
          <Card key={i} className={`p-5 shadow-soft border-border/60 ${s.gradient ? "bg-brand-gradient text-primary-foreground" : ""}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
              <DollarSign className="w-3.5 h-3.5"/>{s.label}
            </div>
            <p className="font-display text-3xl font-semibold mt-1">{fmtThb(s.cost)}</p>
            <p className={`text-xs mt-0.5 ${s.gradient ? "opacity-80" : "text-muted-foreground"}`}>
              ({fmtUsd(s.cost)} USD)
            </p>
            <div className={`flex gap-4 mt-3 text-xs ${s.gradient ? "opacity-90" : "text-muted-foreground"}`}>
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3"/>{s.calls.toLocaleString()} ครั้ง</span>
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3"/>{s.tokens.toLocaleString()} tokens</span>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground -mt-3">
        💡 ราคา USD แปลงเป็นบาทที่อัตรา ฿{USD_TO_THB}/USD (โดยประมาณ) · ราคาคำนวณตามอัตรา Lovable AI Gateway ปัจจุบัน
      </p>

      <Tabs defaultValue="model" className="space-y-3">
        <TabsList>
          <TabsTrigger value="model">แยกตามโมเดล</TabsTrigger>
          <TabsTrigger value="source">แยกตามฟีเจอร์</TabsTrigger>
          <TabsTrigger value="recent">รายการล่าสุด</TabsTrigger>
        </TabsList>

        <TabsContent value="model">
          <Card className="p-6 shadow-soft border-border/60">
            <h2 className="font-display text-lg font-semibold mb-4">ค่าใช้จ่ายตามโมเดล (30 วัน)</h2>
            {byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีข้อมูลการใช้งาน</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="pb-2">โมเดล</th>
                      <th className="pb-2 text-right">เรียก</th>
                      <th className="pb-2 text-right">Input tokens</th>
                      <th className="pb-2 text-right">Output tokens</th>
                      <th className="pb-2 text-right">ค่าใช้จ่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModel.map(m => (
                      <tr key={m.model} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{m.model}</td>
                        <td className="py-2 text-right">{m.calls.toLocaleString()}</td>
                        <td className="py-2 text-right">{m.prompt.toLocaleString()}</td>
                        <td className="py-2 text-right">{m.completion.toLocaleString()}</td>
                        <td className="py-2 text-right font-semibold">{fmtThb(m.cost)} <span className="text-muted-foreground text-xs">({fmtUsd(m.cost)})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="source">
          <Card className="p-6 shadow-soft border-border/60">
            <h2 className="font-display text-lg font-semibold mb-4">ค่าใช้จ่ายตามฟีเจอร์ (30 วัน)</h2>
            {bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-2">
                {bySource.map(s => {
                  const pct = bySource[0].cost ? (s.cost / bySource[0].cost) * 100 : 0;
                  return (
                    <div key={s.source} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium">{SOURCE_LABELS[s.source] || s.source}</span>
                        <span className="font-semibold">{fmtThb(s.cost)} <span className="text-muted-foreground text-xs font-normal">({fmtUsd(s.cost)})</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{s.calls.toLocaleString()} ครั้ง</span>
                        <span>·</span>
                        <span>{s.tokens.toLocaleString()} tokens</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-brand-gradient" style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card className="p-6 shadow-soft border-border/60">
            <h2 className="font-display text-lg font-semibold mb-4">100 รายการล่าสุด</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="pb-2">เวลา</th>
                    <th className="pb-2">ฟีเจอร์</th>
                    <th className="pb-2">โมเดล</th>
                    <th className="pb-2 text-right">tokens</th>
                    <th className="pb-2 text-right">ค่าใช้จ่าย</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.slice(0, 100).map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-1.5"><Badge variant="secondary" className="text-xs">{SOURCE_LABELS[r.source] || r.source}</Badge></td>
                      <td className="py-1.5 font-mono text-xs">{r.model.replace(/^[^/]+\//, "")}</td>
                      <td className="py-1.5 text-right text-xs">{r.prompt_tokens.toLocaleString()} → {r.completion_tokens.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-xs font-medium">{fmtThb(r.cost_usd)}</td>
                    </tr>
                  ))}
                  {usage.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">ยังไม่มีข้อมูล</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Context cache section */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">Context Cache</h2>
            <p className="text-xs text-muted-foreground">ข้อมูลที่ส่งให้ AI ในแต่ละครั้ง (~{cacheTotal.toLocaleString()} tokens รวม)</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={rebuildEmbeddings} disabled={busyEmbed} size="sm" variant="outline" title="สร้าง vector ของ KB/Pkg/Promo ทั้งหมดใหม่ (ใช้เมื่อเปลี่ยนข้อมูลจำนวนมาก)">
              {busyEmbed ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <RefreshCw className="w-4 h-4 mr-1"/>}
              Rebuild Embeddings
            </Button>
            <Button onClick={rebuild} disabled={busy} size="sm" variant="outline">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <RefreshCw className="w-4 h-4 mr-1"/>}
              Rebuild
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {cacheRows.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3 border rounded-lg p-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{LABELS[r.key] || r.key}</p>
                <p className="text-xs text-muted-foreground">
                  {r.meta?.item_count || 0} รายการ · อัปเดต {new Date(r.updated_at).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                </p>
              </div>
              <Badge variant="secondary">{(r.token_count || 0).toLocaleString()} tokens</Badge>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Eye className="w-4 h-4 mr-1"/>ดูเนื้อหา</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <DialogHeader><DialogTitle>{LABELS[r.key] || r.key}</DialogTitle></DialogHeader>
                  <pre className="text-xs whitespace-pre-wrap bg-muted/40 p-3 rounded-lg overflow-auto flex-1">{r.content || "(ว่าง)"}</pre>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <h2 className="font-display text-lg font-semibold mb-1">Token Budgets ต่อข้อความ</h2>
        <p className="text-xs text-muted-foreground mb-4">ขีดจำกัด context ที่ระบบ truncate ก่อนส่งให้ AI</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BUDGETS.map(b => (
            <div key={b.name} className="border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">{b.name}</p>
              <p className="font-display text-xl font-semibold">{b.tokens.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">tokens</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
