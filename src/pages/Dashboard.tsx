import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSnippet } from "@/lib/snippet";

import { Card } from "@/components/ui/card";
import { MessageSquare, Users, Clock, TrendingUp, Bot, AlertCircle, AlertTriangle, DollarSign, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";


const STATUS_LABELS: Record<string, string> = {
  new: "ลูกค้าใหม่",
  inquiry: "สอบถาม",
  returning: "ลูกค้าเก่า",
  pending_quote: "รอเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม",
  confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)",
  completed: "จัดงานจบแล้ว",
  postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)",
  cancelled: "ยกเลิก",
};

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const [c, u, conv, today, clv, confirmed, newToday, returningToday, legacyToday] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }).gt("unread_count", 0),
        supabase.from("conversations").select("*", { count: "exact", head: true }),
        supabase.from("conversations").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
        supabase.from("customers").select("clv_amount"),
        supabase.from("customers").select("*", { count: "exact", head: true }).in("status", ["confirmed", "confirmed_returning"]),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("customer_origin", "new").gte("created_at", todayStart),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("customer_origin", "returning").gte("updated_at", todayStart),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("customer_origin", "legacy").gte("created_at", todayStart),
      ]);
      const totalClv = (clv.data ?? []).reduce((s, r: any) => s + Number(r.clv_amount || 0), 0);
      return {
        customers: c.count ?? 0,
        unread: u.count ?? 0,
        totalMsg: conv.count ?? 0,
        todayMsg: today.count ?? 0,
        totalClv,
        confirmed: confirmed.count ?? 0,
        newToday: newToday.count ?? 0,
        returningToday: returningToday.count ?? 0,
        legacyToday: legacyToday.count ?? 0,
        activeLeadsToday: (newToday.count ?? 0) + (returningToday.count ?? 0),
      };
    },
  });

  // SLA breaches: คำนวณ on-the-fly จาก last_message_at + sla_hours (app_settings)
  // เงื่อนไข: ยังไม่ได้อ่าน (unread_count > 0), ไม่ใช่ confirmed/cancelled, และเกินเวลา SLA
  const { data: slaBreached } = useQuery({
    queryKey: ["sla-breached"],
    queryFn: async () => {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("sla_hours")
        .limit(1)
        .maybeSingle();
      const slaHours = Number(settings?.sla_hours ?? 24);
      const cutoff = new Date(Date.now() - slaHours * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("customers")
        .select("*")
        .gt("unread_count", 0)
        .lt("last_message_at", cutoff)
        .not("status", "in", "(confirmed,confirmed_returning,postponed,cancelled)")
        .order("last_message_at", { ascending: true })
        .limit(10);
      return (data ?? []).map((r: any) => ({
        ...r,
        _sla_deadline: new Date(new Date(r.last_message_at).getTime() + slaHours * 3600 * 1000).toISOString(),
      }));
    },
    refetchInterval: 60_000,
  });

  // Top CLV
  const { data: topClv } = useQuery({
    queryKey: ["top-clv"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .gt("clv_amount", 0)
        .order("clv_amount", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-customers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(8);
      return data ?? [];
    },
  });

  const fmtTHB = (n: number) =>
    new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(n);

  const cards = [
    { label: "ลูกค้าทั้งหมด", value: stats?.customers ?? "—", icon: Users, color: "text-info" },
    { label: "ยังไม่ได้อ่าน", value: stats?.unread ?? "—", icon: AlertCircle, color: "text-warning" },
    { label: "ยืนยันแล้ว", value: stats?.confirmed ?? "—", icon: TrendingUp, color: "text-success" },
    { label: "CLV รวม", value: stats ? fmtTHB(stats.totalClv) : "—", icon: DollarSign, color: "text-primary" },
    { label: "ข้อความวันนี้", value: stats?.todayMsg ?? "—", icon: MessageSquare, color: "text-primary" },
    { label: "ข้อความทั้งหมด", value: stats?.totalMsg ?? "—", icon: TrendingUp, color: "text-muted-foreground" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">ภาพรวมระบบ</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">ติดตามสถานะแชทบอทและลูกค้า LINE OA</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {cards.map(c => (
          <Card key={c.label} className="p-3 sm:p-5 shadow-soft border-border/60 hover:shadow-elevated transition-shadow min-w-0">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{c.label}</p>
                <p className="font-display text-lg sm:text-2xl font-semibold mt-1 sm:mt-2 truncate">{c.value}</p>
              </div>
              <div className={`p-1.5 sm:p-2.5 rounded-lg bg-muted ${c.color} shrink-0`}><c.icon className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#378ADD] shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">New Lead วันนี้</p>
              <p className="font-display font-semibold text-xl">{stats?.newToday ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">ลูกค้าใหม่จริงๆ</p>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#7F77DD] shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Returning Lead วันนี้</p>
              <p className="font-display font-semibold text-xl">{stats?.returningToday ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">ลูกค้าเก่ากลับมาจัดอีก</p>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3 opacity-60">
            <div className="w-3 h-3 rounded-full bg-[#888780] shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Legacy วันนี้</p>
              <p className="font-display font-semibold text-xl">{stats?.legacyToday ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">ก่อนเปิดระบบ (ไม่นับเป็น lead)</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Active Leads วันนี้: <strong>{stats?.activeLeadsToday ?? "—"} คน</strong> (New + Returning)
        </p>
      </div>



      {/* SLA Breaches */}
      <Card className="shadow-soft border-border/60 border-l-4 border-l-destructive min-w-0 overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h2 className="font-display font-semibold">SLA เกินกำหนด</h2>
            {slaBreached && slaBreached.length > 0 && (
              <Badge variant="destructive" className="ml-1">{slaBreached.length}</Badge>
            )}
          </div>
          <Link to="/chats" className="text-sm text-primary hover:underline">ดูทั้งหมด →</Link>
        </div>
        <div className="divide-y">
          {(!slaBreached || slaBreached.length === 0) && (
            <p className="p-6 text-center text-sm text-muted-foreground">ไม่มีลูกค้าที่เกิน SLA 🎉</p>
          )}
          {slaBreached?.map((r: any) => (
            <Link to="/chats" key={r.id} className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center font-semibold">
                {(r.nickname || r.display_name || "?")[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{r.nickname || r.display_name || "ไม่มีชื่อ"}</p>
                  <Badge variant="outline" className="h-5 px-1.5">{STATUS_LABELS[r.status] || r.status}</Badge>
                  {r.phone && <Badge variant="secondary" className="h-5 px-1.5"><Phone className="w-3 h-3 mr-1"/>{r.phone}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{formatSnippet(r.last_message_snippet)}</p>

              </div>
              <span className="text-xs text-destructive shrink-0 font-medium">
                เกิน {formatDistanceToNow(new Date(r._sla_deadline), { locale: th })}
              </span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 min-w-0">
        {/* Recent */}
        <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display font-semibold">การสนทนาล่าสุด</h2>
            </div>
            <Link to="/chats" className="text-sm text-primary hover:underline">ดูทั้งหมด →</Link>
          </div>
          <div className="divide-y">
            {recent?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีลูกค้า — เชื่อม LINE OA เพื่อเริ่มรับข้อความ</p>}
            {recent?.map(r => (
              <Link to="/chats" key={r.id} className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 shrink-0 rounded-full bg-brand-gradient flex items-center justify-center text-primary-foreground font-semibold">
                  {(r.nickname || r.display_name || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate min-w-0 flex-1">{r.nickname || r.display_name || "ไม่มีชื่อ"}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {r.last_message_at ? formatDistanceToNow(new Date(r.last_message_at), { addSuffix: true, locale: th }) : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">{formatSnippet(r.last_message_snippet)}</p>
                    {r.unread_count > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px] shrink-0">{r.unread_count}</Badge>}
                    {!r.ai_active && <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0"><Bot className="w-2.5 h-2.5 mr-0.5"/>Manual</Badge>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Top CLV */}
        <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-success" />
              <h2 className="font-display font-semibold">Top CLV</h2>
            </div>
          </div>
          <div className="divide-y">
            {(!topClv || topClv.length === 0) && (
              <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล CLV — บันทึกยอดที่ลูกค้าใช้จริงในหน้าแชท</p>
            )}
            {topClv?.map((r: any, idx: number) => (
              <Link to="/chats" key={r.id} className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                <div className="w-6 shrink-0 text-center font-display text-lg text-muted-foreground">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate min-w-0 flex-1">{r.nickname || r.display_name || "ไม่มีชื่อ"}</p>
                    <span className="font-display font-semibold text-success text-sm shrink-0">{fmtTHB(Number(r.clv_amount))}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                      {r.event_type || "—"} {r.guest_count ? `· ${r.guest_count} คน` : ""}
                    </p>
                    <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0">{STATUS_LABELS[r.status] || r.status}</Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
