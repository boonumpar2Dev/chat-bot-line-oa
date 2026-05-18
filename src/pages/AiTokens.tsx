import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, RefreshCw, Zap, Eye } from "lucide-react";
import { toast } from "sonner";

const LABELS: Record<string, string> = {
  kb_summary: "ความรู้ (Knowledge Base)",
  packages_summary: "แพ็กเกจจัดเลี้ยง",
  promotions_summary: "โปรโมชั่น",
};

const BUDGETS = [
  { name: "Knowledge Base", tokens: 3000 },
  { name: "Packages", tokens: 2000 },
  { name: "Promotions", tokens: 800 },
  { name: "History", tokens: 2000 },
];

export default function AiTokens() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("ai_context_cache").select("*").order("key");
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rebuild = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("rebuild-ai-cache");
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Rebuild สำเร็จ");
    load();
  };

  const total = rows.reduce((a, r) => a + (r.token_count || 0), 0);
  const latestUpdate = rows.reduce<string | null>(
    (a, r) => (!a || new Date(r.updated_at) > new Date(a) ? r.updated_at : a),
    null
  );

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1 flex items-center gap-2">
            <Zap className="text-primary"/> AI Tokens
          </h1>
          <p className="text-muted-foreground">ติดตามและจัดการ context cache ที่ส่งให้ AI</p>
        </div>
        <Button onClick={rebuild} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <RefreshCw className="w-4 h-4 mr-1"/>}
          Rebuild ทั้งหมด
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5 shadow-soft border-border/60 bg-brand-gradient text-primary-foreground">
          <p className="text-xs uppercase tracking-wide opacity-80">รวม Token Cache</p>
          <p className="font-display text-4xl font-semibold mt-1">~{total.toLocaleString()}</p>
          <p className="text-xs opacity-80 mt-1">tokens ที่ส่งให้ AI ในแต่ละครั้ง</p>
        </Card>
        <Card className="p-5 shadow-soft border-border/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">อัปเดตล่าสุด</p>
          <p className="font-display text-lg font-semibold mt-1">
            {latestUpdate ? new Date(latestUpdate).toLocaleString("th-TH") : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Cache จะ rebuild อัตโนมัติเมื่อแก้ไข KB / แพ็กเกจ / โปรโมชั่น</p>
        </Card>
      </div>

      <Card className="p-6 shadow-soft border-border/60">
        <h2 className="font-display text-lg font-semibold mb-4">Cache Blocks</h2>
        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มี cache — กด "Rebuild ทั้งหมด" เพื่อสร้างครั้งแรก</p>
          )}
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3 border rounded-lg p-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{LABELS[r.key] || r.key}</p>
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
