import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, MessageSquare, Bot, Clock, Zap, Image as ImageIcon, Search, ExternalLink, Sparkles } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { th } from "date-fns/locale";
import { Link } from "react-router-dom";

type AuditRow = {
  id: string;
  created_at: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_message: string | null;
  ai_reply: string | null;
  ai_reply_bubbles: string[];
  image_titles: string[];
  intent_extracted: Record<string, any>;
  confidence: number | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  recent_context: string | null;
  status: string;
  error: string | null;
};

const RANGE_HOURS: Record<string, number> = {
  "1d": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "all": 24 * 365 * 5,
};

export default function AiReplyAuditList({ onAnalyzeWithCoach }: { onAnalyzeWithCoach?: (id: string, label: string) => void } = {}) {
  const [range, setRange] = useState<keyof typeof RANGE_HOURS>("7d");
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");
  const [lowConfOnly, setLowConfOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["ai-reply-audit", range, statusFilter, lowConfOnly],
    queryFn: async () => {
      const since = new Date(Date.now() - RANGE_HOURS[range] * 3600 * 1000).toISOString();
      let q = supabase
        .from("ai_reply_audit" as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (lowConfOnly) q = q.lt("confidence", 70);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const customerIds = Array.from(new Set((rows ?? []).map(r => r.customer_id).filter(Boolean) as string[]));
  const { data: customerMap } = useQuery({
    queryKey: ["audit-customer-names", customerIds.sort().join(",")],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, display_name, nickname")
        .in("id", customerIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((c: any) => { m[c.id] = c.nickname || c.display_name || "ไม่ทราบชื่อ"; });
      return m;
    },
  });

  const filtered = (rows ?? []).filter(r => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const name = (r.customer_id && customerMap?.[r.customer_id]) || "";
    return (
      name.toLowerCase().includes(s) ||
      (r.customer_message || "").toLowerCase().includes(s) ||
      (r.ai_reply || "").toLowerCase().includes(s)
    );
  });

  return (
    <Card className="shadow-soft border-border/60">
      {/* Filter bar */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">วันนี้ (24 ชม.)</SelectItem>
              <SelectItem value="7d">7 วันล่าสุด</SelectItem>
              <SelectItem value="30d">30 วันล่าสุด</SelectItem>
              <SelectItem value="all">ทั้งหมด</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              <SelectItem value="sent">ส่งสำเร็จ</SelectItem>
              <SelectItem value="failed">ล้มเหลว</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={lowConfOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setLowConfOnly(v => !v)}
            className="h-9"
          >
            ⚠️ ความมั่นใจต่ำ &lt;70%
          </Button>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="ค้นชื่อลูกค้า / คำถาม / คำตอบ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9">รีเฟรช</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          แสดง {filtered.length} รายการ {rows && rows.length === 300 ? "(จำกัด 300 รายการล่าสุด — แคบช่วงเวลาเพื่อดูเก่ากว่านี้)" : ""}
        </p>
      </div>

      {/* List */}
      <div className="divide-y">
        {isLoading && <p className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">ไม่พบรายการ AI ตอบในช่วงนี้</p>
        )}
        {filtered.map(r => {
          const name = (r.customer_id && customerMap?.[r.customer_id]) || "ไม่ทราบชื่อ";
          const isOpen = !!expanded[r.id];
          const confColor =
            r.confidence == null ? "text-muted-foreground"
            : r.confidence >= 80 ? "text-success"
            : r.confidence >= 60 ? "text-warning"
            : "text-destructive";
          return (
            <div key={r.id} className="hover:bg-muted/30 transition-colors">
              <button
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                className="w-full text-left p-4 space-y-2"
              >
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <span className="font-medium text-sm text-foreground truncate max-w-[180px]">{name}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: th })}
                  </span>
                  {r.latency_ms != null && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {r.latency_ms}ms
                    </span>
                  )}
                  {r.confidence != null && (
                    <span className={`font-mono ${confColor}`}>conf {Math.round(r.confidence)}%</span>
                  )}
                  {r.status !== "sent" && (
                    <Badge variant="destructive" className="h-5">{r.status}</Badge>
                  )}
                  {r.image_titles?.length > 0 && (
                    <span className="text-muted-foreground flex items-center gap-0.5">
                      <ImageIcon className="w-3 h-3" /> ×{r.image_titles.length}
                    </span>
                  )}
                </div>

                {/* Customer Q */}
                <div className="flex gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className={`text-sm text-foreground/90 ${isOpen ? "" : "line-clamp-2"} break-words`}>
                    {r.customer_message || <span className="italic text-muted-foreground">ไม่มีข้อความ</span>}
                  </p>
                </div>

                {/* AI A */}
                <div className="flex gap-2 bg-primary/5 border border-primary/15 rounded-md p-2.5">
                  <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className={`text-sm text-foreground ${isOpen ? "whitespace-pre-wrap" : "line-clamp-2"} break-words`}>
                    {r.ai_reply || (r.error ? <span className="text-destructive italic">ERROR: {r.error}</span> : <span className="italic text-muted-foreground">—</span>)}
                  </p>
                </div>

                {/* Intent chips */}
                {Object.keys(r.intent_extracted || {}).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(r.intent_extracted).filter(([_, v]) => v !== null && v !== "" && v !== undefined).slice(0, 8).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="h-5 text-xs font-normal">
                        {k}: {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-4 pb-4 ml-6 space-y-3 border-l-2 border-border/40 pl-4">
                  {r.recent_context && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">📜 บริบทก่อนหน้า</p>
                      <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words max-h-60 overflow-y-auto font-sans">
                        {r.recent_context}
                      </pre>
                    </div>
                  )}

                  {r.ai_reply_bubbles?.length > 1 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">🤖 บับเบิลทั้งหมด ({r.ai_reply_bubbles.length})</p>
                      <div className="space-y-1.5">
                        {r.ai_reply_bubbles.map((b, i) => (
                          <div key={i} className="text-sm bg-primary/5 border border-primary/15 rounded p-2">
                            <span className="text-xs text-muted-foreground mr-2">#{i + 1}</span>
                            {b}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.image_titles?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">🖼️ รูปที่ส่ง</p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.image_titles.map((t, i) => (
                          <Badge key={i} variant="secondary" className="h-5 text-xs font-normal">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Meta label="Model" value={r.model || "—"} />
                    <Meta label="Tokens in/out" value={`${r.tokens_in ?? "—"} / ${r.tokens_out ?? "—"}`} />
                    <Meta label="Latency" value={r.latency_ms ? `${r.latency_ms}ms` : "—"} />
                    <Meta label="เวลา" value={format(new Date(r.created_at), "d MMM HH:mm:ss", { locale: th })} />
                  </div>

                  <div className="pt-1 flex items-center gap-3 flex-wrap">
                    {r.customer_id && (
                      <Link
                        to={`/customers/${r.customer_id}`}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        เปิดแชทเต็ม <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {onAnalyzeWithCoach && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnalyzeWithCoach(r.id, `${name} · ${format(new Date(r.created_at), "d MMM HH:mm", { locale: th })}`);
                        }}
                      >
                        <Sparkles className="w-3 h-3" /> วิเคราะห์ด้วย Coach
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded px-2 py-1.5">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="font-mono text-foreground truncate">{value}</p>
    </div>
  );
}
