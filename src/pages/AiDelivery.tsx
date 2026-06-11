import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Activity, RefreshCw, Bot, Radio, ListChecks, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { Link, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AiReplyAuditList from "@/components/ai-delivery/AiReplyAuditList";

type LogRow = {
  id: string;
  event_type: string;
  severity: "info" | "warn" | "error" | string;
  customer_id: string | null;
  line_user_id: string | null;
  conv_id: string | null;
  message: string | null;
  details: Record<string, any>;
  created_at: string;
};

const EVENT_LABEL: Record<string, string> = {
  ai_reply_sent: "ส่งสำเร็จ",
  save_failed_pre_push: "บันทึก DB ล้มเหลว",
  rollback_push_failed: "Rollback (Push ล้มเหลว)",
  partial_push_fail: "ส่งบางส่วนล้มเหลว",
};

const SEVERITY_STYLE: Record<string, { icon: any; color: string; bg: string; badge: "default" | "destructive" | "secondary" | "outline" }> = {
  info:  { icon: CheckCircle2,  color: "text-success",     bg: "bg-success/10",     badge: "secondary" },
  warn:  { icon: AlertTriangle, color: "text-warning",     bg: "bg-warning/10",     badge: "outline" },
  error: { icon: XCircle,       color: "text-destructive", bg: "bg-destructive/10", badge: "destructive" },
};

export default function AiDelivery() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState("events");
  const [coachAudit, setCoachAudit] = useState<{ id: string; label: string } | null>(null);

  const goToCoach = (id: string, label: string) => {
    setCoachAudit({ id, label });
    setTab("coach");
  };

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["ai-delivery-logs", filter],
    queryFn: async () => {
      let q = supabase.from("ai_delivery_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("severity", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const customerIds = Array.from(new Set((logs ?? []).map(l => l.customer_id).filter(Boolean) as string[]));
  const { data: customerMap } = useQuery({
    queryKey: ["ai-delivery-customer-names", customerIds.sort().join(",")],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, display_name, nickname")
        .in("id", customerIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => {
        map[c.id] = c.nickname || c.display_name || "ไม่ทราบชื่อ";
      });
      return map;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["ai-delivery-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [total, ok, err, warn] = await Promise.all([
        supabase.from("ai_delivery_logs").select("*", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("ai_delivery_logs").select("*", { count: "exact", head: true }).gte("created_at", since).eq("severity", "info"),
        supabase.from("ai_delivery_logs").select("*", { count: "exact", head: true }).gte("created_at", since).eq("severity", "error"),
        supabase.from("ai_delivery_logs").select("*", { count: "exact", head: true }).gte("created_at", since).eq("severity", "warn"),
      ]);
      return { total: total.count ?? 0, ok: ok.count ?? 0, err: err.count ?? 0, warn: warn.count ?? 0 };
    },
    refetchInterval: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel("ai-delivery-logs-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_delivery_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["ai-delivery-logs"] });
        qc.invalidateQueries({ queryKey: ["ai-delivery-stats"] });
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cards = [
    { label: "ทั้งหมด (24 ชม.)", value: stats?.total ?? "—", icon: Activity, color: "text-info" },
    { label: "ส่งสำเร็จ",         value: stats?.ok ?? "—",    icon: CheckCircle2, color: "text-success" },
    { label: "ผิดพลาด",           value: stats?.err ?? "—",   icon: XCircle, color: "text-destructive" },
    { label: "เตือน (บางส่วน)",    value: stats?.warn ?? "—",  icon: AlertTriangle, color: "text-warning" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary" /> สถานะการส่ง AI → LINE
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${live ? "text-success animate-pulse" : "text-muted-foreground"}`} />
            {live ? "เชื่อมต่อแบบเรียลไทม์" : "กำลังเชื่อมต่อ…"} · เห็นได้เฉพาะ owner
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1.5" /> รีเฟรช
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="p-5 shadow-soft border-border/60">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">{c.label}</p>
                <p className="font-display text-2xl font-semibold mt-2">{c.value}</p>
              </div>
              <div className={`p-2.5 rounded-lg bg-muted ${c.color} shrink-0`}><c.icon className="w-5 h-5" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="events" className="gap-1.5">
            <Activity className="w-4 h-4" /> Event Log
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ListChecks className="w-4 h-4" /> ตรวจสอบ AI ตอบ
          </TabsTrigger>
          <TabsTrigger value="coach" className="gap-1.5">
            <Sparkles className="w-4 h-4" /> AI Coach
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card className="shadow-soft border-border/60">
            <div className="p-4 border-b flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-semibold mr-2">เหตุการณ์ล่าสุด</h2>
              {(["all","error","warn","info"] as const).map(f => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="h-7"
                >
                  {f === "all" ? "ทั้งหมด" : f === "error" ? "ผิดพลาด" : f === "warn" ? "เตือน" : "สำเร็จ"}
                </Button>
              ))}
            </div>
            <div className="divide-y">
              {isLoading && <p className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด…</p>}
              {!isLoading && logs?.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มี event ในหมวดนี้ 🎉</p>
              )}
              {logs?.map(log => {
                const s = SEVERITY_STYLE[log.severity] ?? SEVERITY_STYLE.info;
                const Icon = s.icon;
                return (
                  <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors">
                    <div className={`p-2 rounded-lg ${s.bg} ${s.color} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.customer_id ? (
                          <Link
                            to={`/customers/${log.customer_id}`}
                            className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate max-w-[200px]"
                          >
                            {customerMap?.[log.customer_id] ?? "กำลังโหลด…"}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">ไม่ระบุลูกค้า</span>
                        )}
                        <Badge variant={s.badge} className="h-5">{EVENT_LABEL[log.event_type] ?? log.event_type}</Badge>
                        {log.line_user_id && (
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {log.line_user_id.slice(0, 12)}…
                          </span>
                        )}
                      </div>
                      {log.message && (
                        <p className="text-sm mt-1 line-clamp-2 break-words">{log.message}</p>
                      )}
                      {Object.keys(log.details ?? {}).length > 0 && (
                        <details className="mt-1.5">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">รายละเอียด</summary>
                          <pre className="text-xs bg-muted/50 rounded p-2 mt-1 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: th })}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <AiReplyAuditList onAnalyzeWithCoach={goToCoach} />
        </TabsContent>

        <TabsContent value="coach">
          <AiCoachChat
            initialAuditId={coachAudit?.id || null}
            initialAuditLabel={coachAudit?.label}
            onClearAudit={() => setCoachAudit(null)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
