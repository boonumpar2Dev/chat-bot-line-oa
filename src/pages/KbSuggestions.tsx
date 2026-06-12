import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sparkles, Loader2, Check, X, Eye, Pencil, CalendarIcon, RefreshCw, BookPlus } from "lucide-react";
import { format, subDays } from "date-fns";
import { th } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Strictness = "strict" | "medium" | "loose";
type Suggestion = {
  id: string;
  suggested_q: string;
  suggested_a: string;
  occurrence_count: number;
  customer_ids: string[];
  source_message_ids: string[];
  status: "pending" | "approved" | "dismissed";
  scan_from: string | null;
  scan_to: string | null;
  strictness: string | null;
  created_at: string;
};

const STRICT_LABELS: Record<Strictness, { label: string; hint: string; emoji: string }> = {
  strict: { label: "เข้มงวด", hint: "พบซ้ำ ≥5 ครั้ง / ≥2 ลูกค้า", emoji: "🟢" },
  medium: { label: "กลาง", hint: "พบซ้ำ ≥3 ครั้ง / ≥2 ลูกค้า (แนะนำ)", emoji: "🟡" },
  loose:  { label: "ผ่อน", hint: "พบซ้ำ ≥2 ครั้ง / ≥1 ลูกค้า (เยอะหน่อย)", emoji: "🔴" },
};
const STRICT_ORDER: Strictness[] = ["strict", "medium", "loose"];

export default function KbSuggestions() {
  const [from, setFrom] = useState<Date>(subDays(new Date(), 14));
  const [to, setTo] = useState<Date>(new Date());
  const [strictness, setStrictness] = useState<Strictness>("medium");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [list, setList] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "dismissed">("pending");
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);

  const counts = useMemo(() => ({
    pending: list.filter((x) => x.status === "pending").length,
    approved: list.filter((x) => x.status === "approved").length,
    dismissed: list.filter((x) => x.status === "dismissed").length,
  }), [list]);

  const visible = list.filter((x) => x.status === tab);

  const load = async () => {
    setLoading(true);
    const [{ data: sugs }, { data: cfg }] = await Promise.all([
      supabase.from("kb_suggestions").select("*").order("occurrence_count", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("app_settings").select("kb_suggest_last_scan_at, kb_suggest_strictness").eq("key", "ai_config").maybeSingle(),
    ]);
    setList((sugs as any) || []);
    setLastScan((cfg as any)?.kb_suggest_last_scan_at || null);
    if ((cfg as any)?.kb_suggest_strictness) setStrictness((cfg as any).kb_suggest_strictness);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-kb-suggestions", {
        body: {
          from: format(from, "yyyy-MM-dd"),
          to: format(to, "yyyy-MM-dd"),
          strictness,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      toast.success(`สแกนเสร็จ — สแกน ${d.scanned} ข้อความ, ${d.suggestions} ข้อเสนอใหม่`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "สแกนไม่สำเร็จ");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> AI แนะนำเข้า KB
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI วิเคราะห์คำตอบของแอดมินในแชท → จับคู่ที่ซ้ำกัน → เสนอเพิ่มเข้า KB กลาง
        </p>
      </div>

      {/* Scan controls */}
      <Card className="p-4 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">วันที่เริ่ม</Label>
            <DatePick value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">วันที่สิ้นสุด</Label>
            <DatePick value={to} onChange={setTo} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ความเข้มงวด: <span className="font-medium">{STRICT_LABELS[strictness].emoji} {STRICT_LABELS[strictness].label}</span></Label>
            <Slider
              min={0} max={2} step={1}
              value={[STRICT_ORDER.indexOf(strictness)]}
              onValueChange={([v]) => setStrictness(STRICT_ORDER[v])}
              className="py-2"
            />
            <p className="text-[10px] text-muted-foreground">{STRICT_LABELS[strictness].hint}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            สแกนล่าสุด: {lastScan ? format(new Date(lastScan), "d MMM yyyy HH:mm", { locale: th }) : "ยังไม่เคย"}
          </p>
          <Button onClick={runScan} disabled={scanning} size="sm">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            สแกนเลย
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">รอตรวจ ({counts.pending})</TabsTrigger>
          <TabsTrigger value="approved">เพิ่มแล้ว ({counts.approved})</TabsTrigger>
          <TabsTrigger value="dismissed">ไม่ใช่ ({counts.dismissed})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />กำลังโหลด…</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground border rounded-lg bg-card">
              {tab === "pending" ? "ยังไม่มีข้อเสนอ — กดสแกนด้านบนได้เลย" : "ว่าง"}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((s) => (
                <SuggestionCard key={s.id} s={s} onChanged={load} onPreview={() => setPreviewIds(s.source_message_ids)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SourcePreviewDialog ids={previewIds} onClose={() => setPreviewIds(null)} />
    </div>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
          <CalendarIcon className="w-4 h-4 mr-1.5" />
          {format(value, "d MMM yyyy", { locale: th })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

function SuggestionCard({ s, onChanged, onPreview }: { s: Suggestion; onChanged: () => void; onPreview: () => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(s.suggested_q);
  const [a, setA] = useState(s.suggested_a);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const title = q.trim().slice(0, 60);
      const content = `Q: ${q.trim()}\nA: ${a.trim()}`;
      const { data: row, error } = await supabase.from("knowledge_base").insert({
        title, content, status: "active",
      }).select("id").single();
      if (error) throw error;
      if (row?.id) supabase.functions.invoke("embed-content", { body: { table: "knowledge_base", id: row.id } }).catch(()=>{});
      await supabase.from("kb_suggestions").update({
        status: "approved",
        suggested_q: q.trim(),
        suggested_a: a.trim(),
        knowledge_base_id: row?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", s.id);
      supabase.functions.invoke("rebuild-ai-cache").catch(()=>{});
      toast.success("✅ เพิ่มเข้า KB แล้ว");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await supabase.from("kb_suggestions").update({
        status: "dismissed", reviewed_at: new Date().toISOString(),
      }).eq("id", s.id);
      toast.success("ทำเครื่องหมายว่าไม่ใช่แล้ว");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    await supabase.from("kb_suggestions").update({ status: "pending" }).eq("id", s.id);
    onChanged();
    setBusy(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px]">
          🔁 พบ {s.occurrence_count} ครั้ง · {s.customer_ids.length} ลูกค้า
        </Badge>
        {s.strictness && <Badge variant="outline" className="text-[10px]">{s.strictness}</Badge>}
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px]">คำถาม</Label>
            <Textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">คำตอบ</Label>
            <Textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} className="text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-sm"><span className="text-muted-foreground text-xs mr-1">Q:</span>{s.suggested_q}</div>
          <div className="text-sm bg-muted/40 rounded-md p-2 border-l-2 border-primary"><span className="text-muted-foreground text-xs mr-1">A:</span>{s.suggested_a}</div>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t">
        <Button size="sm" variant="ghost" className="h-8" onClick={onPreview}>
          <Eye className="w-3.5 h-3.5 mr-1" />ดูต้นทาง
        </Button>
        {s.status === "pending" && (
          <>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing((v) => !v)}>
              <Pencil className="w-3.5 h-3.5 mr-1" />{editing ? "ยกเลิก" : "แก้"}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={dismiss} disabled={busy}>
              <X className="w-3.5 h-3.5 mr-1" />ไม่ใช่
            </Button>
            <Button size="sm" className="h-8" onClick={approve} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              เพิ่มเข้า KB
            </Button>
          </>
        )}
        {s.status !== "pending" && (
          <>
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="h-8" onClick={restore} disabled={busy}>กลับเป็นรอตรวจ</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function SourcePreviewDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ids || !ids.length) { setMsgs([]); return; }
    setLoading(true);
    supabase.from("conversations")
      .select("id, message, sender, created_at, customer_id, customers(nickname, display_name)")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setMsgs((data as any) || []); setLoading(false); });
  }, [ids]);

  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ต้นทางข้อความ ({ids?.length || 0} ข้อความ)</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        ) : (
          <div className="space-y-2">
            {msgs.map((m) => (
              <div key={m.id} className="border rounded-md p-2.5 text-sm space-y-1 bg-card">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>👤 {(m.customers?.nickname || m.customers?.display_name || "ลูกค้า")}</span>
                  <span>{format(new Date(m.created_at), "d MMM HH:mm", { locale: th })}</span>
                </div>
                <div className="whitespace-pre-wrap">{m.message}</div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>ปิด</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
