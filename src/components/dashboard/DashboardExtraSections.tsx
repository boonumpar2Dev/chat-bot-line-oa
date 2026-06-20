import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  CalendarIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  FileText,
  Activity,
  ArrowDown,
  AlertTriangle,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  new: "ลูกค้าใหม่",
  inquiry: "สอบถาม",
  returning: "ลูกค้าเก่า",
  pending_quote: "รอเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม",
  confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)",
  postponed: "เลื่อนวันจัดงาน",
  cancelled: "ยกเลิก",
  completed: "จัดงานจบแล้ว",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  inquiry: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  returning: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  pending_quote: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pending_confirm: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  confirmed: "bg-green-500/10 text-green-700 dark:text-green-300",
  confirmed_returning: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  postponed: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-300",
  completed: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const fmtDayTH = (d: Date) => format(d, "d MMM", { locale: th });

/* ============= Section 1: New customers per day ============= */
const DASHBOARD_MIN_DATE = new Date(2026, 5, 19);
function NewCustomersChart() {
  const [range, setRange] = useState<7 | 30>(7);
  const { data, isLoading, error } = useQuery({
    queryKey: ["new-customers-chart", range],
    queryFn: async () => {
      let since = startOfDay(new Date());
      since.setDate(since.getDate() - (range - 1));
      if (since < DASHBOARD_MIN_DATE) since = startOfDay(DASHBOARD_MIN_DATE);
      const today = startOfDay(new Date());
      const dayCount = Math.floor((today.getTime() - since.getTime()) / 86400000) + 1;
      const { data, error } = await supabase
        .from("customers")
        .select("created_at")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      const buckets: Record<string, number> = {};
      for (let i = 0; i < dayCount; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        buckets[ymd(d)] = 0;
      }
      (data ?? []).forEach((r: any) => {
        const k = ymd(new Date(r.created_at));
        if (k in buckets) buckets[k]++;
      });
      return Object.entries(buckets).map(([date, count]) => ({
        date,
        label: format(new Date(date), "d/M"),
        count,
      }));
    },
  });

  const total = (data ?? []).reduce((s, r) => s + r.count, 0);
  const avg = data && data.length ? (total / data.length).toFixed(1) : "0";

  return (
    <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
      <div className="p-5 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold">ลูกค้าใหม่ต่อวัน</h2>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={range === 7 ? "default" : "outline"} onClick={() => setRange(7)}>
            7 วัน
          </Button>
          <Button size="sm" variant={range === 30 ? "default" : "outline"} onClick={() => setRange(30)}>
            30 วัน
          </Button>
        </div>
      </div>
      <div className="p-5">
        {error && <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>}
        {isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
        {data && (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval={range === 30 ? 3 : 0} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                    formatter={(v: any) => [v, "ลูกค้าใหม่"]}
                    labelFormatter={(l) => `วันที่ ${l}`}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-around mt-3 pt-3 border-t text-sm">
              <div className="text-center">
                <p className="text-muted-foreground text-xs">รวม</p>
                <p className="font-display font-semibold text-lg">{total}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs">เฉลี่ย/วัน</p>
                <p className="font-display font-semibold text-lg">{avg}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ============= Section 2: Daily Report Table ============= */
function DailyReportTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["daily-report-7d-v2"],
    queryFn: async () => {
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = startOfDay(new Date());
        d.setDate(d.getDate() - i);
        if (d < DASHBOARD_MIN_DATE) continue;
        days.push(d);
      }
      if (days.length === 0) days.push(startOfDay(DASHBOARD_MIN_DATE));
      const since = days[0].toISOString();

      const [custRes, convRes] = await Promise.all([
        supabase
          .from("customers")
          .select("created_at,updated_at,status,phone,event_date,guest_count")
          .or(`created_at.gte.${since},updated_at.gte.${since}`)
          .limit(10000),
        supabase
          .from("conversations")
          .select("created_at,sender")
          .gte("created_at", since)
          .eq("sender", "ai"),
      ]);
      if (custRes.error) throw custRes.error;
      if (convRes.error) throw convRes.error;

      return days.map((day) => {
        const dayKey = ymd(day);
        const newCount = (custRes.data ?? []).filter(
          (c: any) => ymd(new Date(c.created_at)) === dayKey
        ).length;
        const completeCount = (custRes.data ?? []).filter(
          (c: any) =>
            ymd(new Date(c.created_at)) === dayKey &&
            c.phone &&
            c.event_date &&
            c.guest_count
        ).length;
        const quoteCount = (custRes.data ?? []).filter(
          (c: any) =>
            c.status === "pending_confirm" &&
            ymd(new Date(c.updated_at)) === dayKey
        ).length;
        const confirmedCount = (custRes.data ?? []).filter(
          (c: any) =>
            (c.status === "confirmed" || c.status === "confirmed_returning") &&
            ymd(new Date(c.updated_at)) === dayKey
        ).length;
        const botCount = (convRes.data ?? []).filter(
          (c: any) => ymd(new Date(c.created_at)) === dayKey
        ).length;
        return {
          day,
          dayKey,
          newCount,
          completeCount,
          quoteCount,
          confirmedCount,
          botCount,
        };
      });
    },
  });

  const todayKey = ymd(startOfDay(new Date()));

  return (
    <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
      <div className="p-5 border-b flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display font-semibold">รายงานรายวัน ({data?.length ?? 7} วันล่าสุด)</h2>
      </div>
      <div className="overflow-x-auto">
        {error && <p className="p-5 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>}
        {isLoading && <p className="p-5 text-sm text-muted-foreground">กำลังโหลด...</p>}
        {data && (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">วันที่</th>
                <th className="text-right p-3 font-medium">ลูกค้าใหม่</th>
                <th className="text-right p-3 font-medium">ข้อมูลครบ</th>
                <th className="text-right p-3 font-medium">ออกใบเสนอราคา</th>
                <th className="text-right p-3 font-medium">คอนเฟิร์ม</th>
                <th className="text-right p-3 font-medium">Bot ตอบ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row) => {
                const isToday = row.dayKey === todayKey;
                return (
                  <tr
                    key={row.dayKey}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      isToday && "bg-primary/5 font-medium"
                    )}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span>{fmtDayTH(row.day)}</span>
                        {isToday && (
                          <Badge variant="default" className="h-4 px-1 text-[10px]">
                            วันนี้
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-right p-3 tabular-nums">{row.newCount}</td>
                    <td className="text-right p-3 tabular-nums">{row.completeCount}</td>
                    <td className="text-right p-3 tabular-nums">{row.quoteCount}</td>
                    <td className="text-right p-3 tabular-nums">{row.confirmedCount}</td>
                    <td className="text-right p-3 tabular-nums">{row.botCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

/* ============= Section 3: Funnel Today + Backlog ============= */
type FunnelMode = "day" | "month";
const FUNNEL_STAGES: { key: string; labelDay: string; labelMonth: string; color: string; subLabel?: string }[] = [
  { key: "new", labelDay: "ลูกค้าใหม่วันนี้", labelMonth: "ลูกค้าใหม่เดือนนี้", color: "#378ADD", subLabel: "ทักเข้ามาครั้งแรก" },
  { key: "quote", labelDay: "ได้ข้อมูลครบ (พร้อมทำใบ)", labelMonth: "ได้ข้อมูลครบ (พร้อมทำใบ)", color: "#E24B4A", subLabel: "เปลี่ยนเป็นรอใบเสนอราคา" },
  { key: "confirm", labelDay: "Admin ส่งใบเสนอราคา", labelMonth: "Admin ส่งใบเสนอราคา", color: "#EF9F27", subLabel: "เปลี่ยนเป็นรอคอนเฟิร์ม" },
  { key: "confirmed", labelDay: "ลูกค้าคอนเฟิร์ม", labelMonth: "ลูกค้าคอนเฟิร์ม", color: "#1D9E75", subLabel: "ปิดการขายได้" },
  { key: "completed", labelDay: "จัดงานจบแล้ว", labelMonth: "จัดงานจบแล้ว", color: "#7F77DD", subLabel: "auto-close" },
];

const FUNNEL_MIN_DATE = new Date(2026, 5, 19);

async function fetchFunnel(mode: FunnelMode, date: Date) {
  const from = mode === "day" ? startOfDay(date) : startOfMonth(date);
  const to = mode === "day" ? endOfDay(date) : endOfMonth(date);

  const { count: newCount, error: e1 } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (e1) throw e1;

  const { data: logs, error: e2 } = await supabase
    .from("customer_status_log")
    .select("customer_id, new_status")
    .gte("changed_at", from.toISOString())
    .lte("changed_at", to.toISOString())
    .limit(10000);
  if (e2) throw e2;

  const countDistinct = (statuses: string[]) => {
    const ids = new Set<string>();
    (logs ?? []).forEach((r: any) => {
      if (statuses.includes(r.new_status)) ids.add(r.customer_id);
    });
    return ids.size;
  };

  return {
    stages: [
      { key: "new", label: "ทักเข้ามา", count: newCount ?? 0 },
      { key: "quote", label: "รอใบเสนอราคา", count: countDistinct(["pending_quote"]) },
      { key: "confirm", label: "รอคอนเฟิร์ม", count: countDistinct(["pending_confirm"]) },
      { key: "confirmed", label: "คอนเฟิร์มแล้ว", count: countDistinct(["confirmed", "confirmed_returning"]) },
      { key: "completed", label: "จัดงานจบแล้ว", count: countDistinct(["completed"]) },
    ],
    inquiryCount: countDistinct(["inquiry"]),
  };
}

function FunnelToday() {
  const [mode, setMode] = useState<FunnelMode>("day");
  const [dateA, setDateA] = useState<Date>(new Date());
  const [compare, setCompare] = useState(false);
  const [dateB, setDateB] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });

  const stepDate = (d: Date, dir: number) => {
    const nd = new Date(d);
    if (mode === "day") nd.setDate(nd.getDate() + dir);
    else nd.setMonth(nd.getMonth() + dir);
    if (nd < FUNNEL_MIN_DATE) return d;
    return nd;
  };

  const queryA = useQuery({
    queryKey: ["funnel-today", mode, ymd(dateA)],
    queryFn: () => fetchFunnel(mode, dateA),
  });
  const queryB = useQuery({
    queryKey: ["funnel-today", mode, ymd(dateB)],
    queryFn: () => fetchFunnel(mode, dateB),
    enabled: compare,
  });

  const chartData = useMemo(() => {
    const a = queryA.data?.stages ?? [];
    const b = queryB.data?.stages ?? [];
    return FUNNEL_STAGES.map((stage, i) => {
      return {
        key: stage.key,
        label: mode === "day" ? stage.labelDay : stage.labelMonth,
        subLabel: stage.subLabel,
        color: stage.color,
        A: a[i]?.count ?? 0,
        B: compare ? b[i]?.count ?? 0 : 0,
        diff: compare ? (a[i]?.count ?? 0) - (b[i]?.count ?? 0) : 0,
      };
    });
  }, [queryA.data, queryB.data, compare, mode]);

  const inquiryA = queryA.data?.inquiryCount ?? 0;

  const fmtPicker = (d: Date) =>
    mode === "day" ? format(d, "d MMM yyyy", { locale: th }) : format(d, "MMM yyyy", { locale: th });

  const DatePickerBtn = ({ value, onChange }: { value: Date; onChange: (d: Date) => void }) => (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onChange(stepDate(value, -1))}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 justify-start text-left font-normal min-w-[120px]">
            <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
            {fmtPicker(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => d && onChange(d)}
            disabled={(date) => date < FUNNEL_MIN_DATE}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onChange(stepDate(value, 1))}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
      <div className="p-5 border-b space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold">📊 {mode === "day" ? "กิจกรรมวันนี้" : "กิจกรรมเดือนนี้"} — เกิดอะไรขึ้น</h2>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={mode === "day" ? "default" : "outline"} onClick={() => setMode("day")}>
              รายวัน
            </Button>
            <Button size="sm" variant={mode === "month" ? "default" : "outline"} onClick={() => setMode("month")}>
              รายเดือน
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerBtn value={dateA} onChange={setDateA} />
          <Button
            size="sm"
            variant={compare ? "default" : "outline"}
            onClick={() => setCompare((v) => !v)}
            className="gap-1.5"
          >
            <GitCompare className="w-3.5 h-3.5" />
            เปรียบเทียบ
          </Button>
          {compare && <DatePickerBtn value={dateB} onChange={setDateB} />}
        </div>
      </div>
      <div className="p-5">
        {(queryA.error || queryB.error) && (
          <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>
        )}
        {queryA.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
        {queryA.data && (() => {
          const firstA = chartData[0]?.A || 1;
          const maxVal = Math.max(...chartData.map((r) => Math.max(r.A, r.B)), 1);
          const totalIn = chartData[0]?.A ?? 0;
          const quoteCount = chartData.find((r) => r.key === "quote")?.A ?? 0;
          const confirmedCount = chartData.find((r) => r.key === "confirmed")?.A ?? 0;
          const conv = totalIn > 0 ? Math.round((confirmedCount / totalIn) * 100) : 0;
          const quotePct = totalIn > 0 ? Math.round((quoteCount / totalIn) * 100) : 0;
          return (
            <>
              <div className="space-y-1">
                {chartData.map((row, i) => {
                  const pctA = (row.A / maxVal) * 100;
                  const pctB = (row.B / maxVal) * 100;
                  const pctOfFirst = firstA > 0 ? Math.round((row.A / firstA) * 100) : 0;
                  const pctOfFirstB = compare && firstA > 0 ? Math.round((row.B / firstA) * 100) : 0;
                  return (
                    <div key={row.key}>
                      {i > 0 && (
                        <div className="flex items-center gap-2 sm:pl-[160px] py-1.5 flex-wrap">
                          <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                          {i === 1 ? (
                            <Badge
                              variant="outline"
                              className="h-5 px-2 text-[11px] font-medium border-0 bg-amber-100 text-amber-700"
                            >
                              ไปสอบถาม {inquiryA} คน (ยังไม่ให้ข้อมูลครบ)
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-5 px-2 text-[11px] font-medium border-0 bg-emerald-100 text-emerald-700"
                            >
                              ไปต่อ {row.A} คน
                              {row.key === "confirm" && " (รอลูกค้าตอบ)"}
                              {row.key === "confirmed" && " (ปิดการขายได้)"}
                              {row.key === "completed" && " (จัดงานเสร็จ)"}
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:block w-[150px] shrink-0 min-w-0">
                          <div className="text-sm font-medium truncate">{row.label}</div>
                          {row.subLabel && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {row.subLabel}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="sm:hidden mb-1">
                            <div className="text-sm font-medium truncate">{row.label}</div>
                            {row.subLabel && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {row.subLabel}
                              </div>
                            )}
                          </div>
                          <div className="relative h-9 bg-muted/40 rounded-md overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 rounded-md transition-all flex items-center px-3"
                              style={{ width: `${pctA}%`, backgroundColor: row.color }}
                            >
                              {pctA > 12 && (
                                <span className="text-xs font-semibold text-white tabular-nums">
                                  {row.A} คน
                                </span>
                              )}
                            </div>
                            {compare && (
                              <div
                                className="absolute left-0 rounded-md transition-all"
                                style={{
                                  width: `${pctB}%`,
                                  backgroundColor: "#7F77DD",
                                  top: "60%",
                                  height: "40%",
                                  opacity: 0.85,
                                }}
                              />
                            )}
                          </div>
                        </div>
                        <div className="w-[90px] sm:w-[130px] shrink-0 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-display font-bold text-lg tabular-nums leading-none">
                              {row.A}
                            </span>
                            {compare && row.diff !== 0 && (
                              <Badge
                                variant={row.diff > 0 ? "default" : "destructive"}
                                className="h-4 px-1 text-[10px]"
                              >
                                {row.diff > 0 ? "+" : ""}
                                {row.diff}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                            {pctOfFirst}%
                            {compare && (
                              <span style={{ color: "#7F77DD" }} className="ml-1">
                                ({pctOfFirstB}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#378ADD" }}>
                  <div className="text-[11px] text-muted-foreground">ทักเข้ามา</div>
                  <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{totalIn}</div>
                </div>
                <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#E24B4A" }}>
                  <div className="text-[11px] text-muted-foreground">ข้อมูลครบ</div>
                  <div className="font-display font-bold text-2xl tabular-nums mt-0.5">
                    {quoteCount} <span className="text-sm text-muted-foreground">({quotePct}%)</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#1D9E75" }}>
                  <div className="text-[11px] text-muted-foreground">Conversion ทัก→คอนเฟิร์ม</div>
                  <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{conv}%</div>
                </div>
                <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#EAB308" }}>
                  <div className="text-[11px] text-muted-foreground">ไปสอบถาม</div>
                  <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{inquiryA}</div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </Card>
  );
}

/* ============= Backlog Card ============= */
type BacklogKey = "inquiry" | "quote" | "confirm" | "confirmed";
const BACKLOG_GROUPS: {
  key: BacklogKey;
  title: string;
  icon: string;
  hint: string;
  statuses: string[];
  bg: string;
  filter: string;
  trendUpGood: boolean;
  pulseOnIncrease?: boolean;
  important?: boolean;
}[] = [
  {
    key: "inquiry",
    title: "สอบถาม (ยังไม่ให้ข้อมูลครบ)",
    icon: "💬",
    hint: "อาจกลับมาให้ข้อมูลได้",
    statuses: ["new", "inquiry", "returning"],
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-900/60",
    filter: "new,inquiry,returning",
    trendUpGood: false,
  },
  {
    key: "quote",
    title: "รอใบเสนอราคา",
    icon: "📄",
    hint: "Admin ต้องทำใบให้ครบ",
    statuses: ["pending_quote"],
    bg: "bg-rose-50 dark:bg-rose-950/30 border-rose-200/60 dark:border-rose-900/60",
    filter: "pending_quote",
    trendUpGood: false,
    pulseOnIncrease: true,
    important: true,
  },
  {
    key: "confirm",
    title: "รอคอนเฟิร์ม (ส่งใบแล้ว)",
    icon: "⏳",
    hint: "ต้องตามลูกค้า",
    statuses: ["pending_confirm"],
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200/60 dark:border-orange-900/60",
    filter: "pending_confirm",
    trendUpGood: false,
  },
  {
    key: "confirmed",
    title: "คอนเฟิร์มแล้ว (รอจัดงาน)",
    icon: "✅",
    hint: "รอวันจัดงาน",
    statuses: ["confirmed", "confirmed_returning"],
    bg: "bg-green-50 dark:bg-green-950/30 border-green-200/60 dark:border-green-900/60",
    filter: "confirmed,confirmed_returning",
    trendUpGood: true,
  },
];

function BacklogCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["backlog-card"],
    queryFn: async () => {
      // count ปัจจุบันต่อ status
      const allStatuses = Array.from(new Set(BACKLOG_GROUPS.flatMap((g) => g.statuses)));
      const counts: Record<string, number> = {};
      await Promise.all(
        allStatuses.map(async (s) => {
          const { count, error } = await supabase
            .from("customers")
            .select("*", { count: "exact", head: true })
            .eq("status", s as any);
          if (error) throw error;
          counts[s] = count ?? 0;
        })
      );

      // ดึง log เมื่อวานเพื่อหา net change
      const yStart = startOfDay(new Date());
      yStart.setDate(yStart.getDate() - 1);
      const yEnd = endOfDay(yStart);
      const { data: logs, error: e2 } = await supabase
        .from("customer_status_log")
        .select("old_status, new_status")
        .gte("changed_at", yStart.toISOString())
        .lte("changed_at", yEnd.toISOString())
        .limit(10000);
      if (e2) throw e2;

      const netByStatus: Record<string, number> = {};
      (logs ?? []).forEach((r: any) => {
        if (r.new_status) netByStatus[r.new_status] = (netByStatus[r.new_status] ?? 0) + 1;
        if (r.old_status) netByStatus[r.old_status] = (netByStatus[r.old_status] ?? 0) - 1;
      });

      return BACKLOG_GROUPS.map((g) => {
        const count = g.statuses.reduce((s, k) => s + (counts[k] ?? 0), 0);
        const net = g.statuses.reduce((s, k) => s + (netByStatus[k] ?? 0), 0);
        return { ...g, count, net };
      });
    },
  });

  return (
    <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
      <div className="p-5 border-b">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h2 className="font-display font-semibold">⚡ ค้างสะสมที่ต้องเคลีย</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          เป้าหมาย: ลดให้เหลือ 0 — ตัวเลขรวมจากทุกวัน
        </p>
      </div>
      <div className="p-5">
        {error && <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>}
        {isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.map((g) => {
              const net = g.net;
              const isIncrease = net > 0;
              const isDecrease = net < 0;
              const trendGood = (isIncrease && g.trendUpGood) || (isDecrease && !g.trendUpGood);
              const trendBad = (isIncrease && !g.trendUpGood) || (isDecrease && g.trendUpGood);
              const trendColor = trendGood
                ? "text-emerald-600"
                : trendBad
                ? "text-rose-600"
                : "text-muted-foreground";
              const pulse = g.pulseOnIncrease && isIncrease;
              return (
                <a
                  key={g.key}
                  href={`/chats?filter=status:${g.filter}`}
                  className={cn(
                    "rounded-lg p-4 border block transition-shadow hover:shadow-md",
                    g.bg
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground/80 truncate">
                        <span className="mr-1">{g.icon}</span>
                        {g.title}
                        {g.important && <span className="ml-1">⚠️</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{g.hint}</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mt-3">
                    <span
                      className={cn(
                        "font-display font-bold text-3xl tabular-nums leading-none",
                        pulse && "animate-pulse"
                      )}
                    >
                      {g.count}
                    </span>
                    {net !== 0 ? (
                      <span className={cn("text-xs font-medium tabular-nums", trendColor)}>
                        {isIncrease ? "↑" : "↓"} {Math.abs(net)} เทียบเมื่อวาน
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">— เทียบเมื่อวาน</span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ============= Section 4: Current statuses + Quote card ============= */
function CurrentStatusGrid() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["current-status-grid"],
    queryFn: async () => {
      const statuses = ["new", "inquiry", "returning", "pending_quote", "pending_confirm", "confirmed", "confirmed_returning", "postponed", "cancelled", "completed"];

      const results = await Promise.all(
        statuses.map(async (status) => {
          const { count, error } = await supabase
            .from("customers")
            .select("*", { count: "exact", head: true })
            .eq("status", status as any);
          if (error) throw error;
          return { status, count: count ?? 0 };
        })
      );

      const grouped: Record<string, { count: number; waitMs: number[] }> = {};
      for (const r of results) {
        grouped[r.status] = { count: r.count, waitMs: [] };
      }

      // query เวลารอเฉลี่ยแยก สำหรับ status ที่มีคนอยู่
      const activeStatuses = results.filter((r) => r.count > 0).map((r) => r.status);
      if (activeStatuses.length > 0) {
        const { data: waitData } = await supabase
          .from("customers")
          .select("status,updated_at")
          .in("status", activeStatuses as any[])
          .limit(10000);
        const now = Date.now();
        (waitData ?? []).forEach((r: any) => {
          if (grouped[r.status] && r.updated_at) {
            grouped[r.status].waitMs.push(now - new Date(r.updated_at).getTime());
          }
        });
      }

      return grouped;
    },
  });

  const fmtWait = (ms: number) => {
    if (!ms || !isFinite(ms)) return "—";
    const h = ms / 3600_000;
    if (h < 1) return `${Math.round(ms / 60_000)} นาที`;
    if (h < 24) return `${h.toFixed(1)} ชม.`;
    return `${(h / 24).toFixed(1)} วัน`;
  };

  const orderedKeys = [
    "new",
    "inquiry",
    "returning",
    "pending_quote",
    "pending_confirm",
    "confirmed",
    "confirmed_returning",
    "completed",
    "postponed",
    "cancelled",
  ];

  const quoteCard = useMemo(() => {
    if (!data) return null;
    return {
      pending_quote: data.pending_quote?.count ?? 0,
      pending_confirm: data.pending_confirm?.count ?? 0,
      confirmed: (data.confirmed?.count ?? 0) + (data.confirmed_returning?.count ?? 0),
    };
  }, [data]);

  return (
    <div className="grid lg:grid-cols-2 gap-6 min-w-0">
      <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold">สถานะลูกค้าตอนนี้</h2>
        </div>
        <div className="p-5">
          {error && <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>}
          {isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
          {data && (
            <div className="grid grid-cols-2 gap-3">
              {orderedKeys
                .filter((k) => data[k]?.count)
                .map((k) => {
                  const g = data[k];
                  const avg = g.waitMs.length
                    ? g.waitMs.reduce((s, n) => s + n, 0) / g.waitMs.length
                    : 0;
                  return (
                    <div
                      key={k}
                      className={cn(
                        "rounded-lg p-3 border border-border/60",
                        STATUS_COLORS[k] || "bg-muted"
                      )}
                    >
                      <p className="text-xs font-medium truncate">{STATUS_LABELS[k] || k}</p>
                      <p className="font-display text-2xl font-semibold mt-1 tabular-nums">
                        {g.count}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        รอเฉลี่ย {fmtWait(avg)}
                      </p>
                    </div>
                  );
                })}
              {Object.keys(data).length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground text-center py-4">
                  ยังไม่มีข้อมูล
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="shadow-soft border-border/60 min-w-0 overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-600" />
          <h2 className="font-display font-semibold">ใบเสนอราคา</h2>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>}
          {isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
          {quoteCard && (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10">
                <div>
                  <p className="text-xs text-muted-foreground">รอออกใบเสนอราคา</p>
                  <p className="font-display text-2xl font-semibold mt-1 text-amber-700 dark:text-amber-300 tabular-nums">
                    {quoteCard.pending_quote}
                  </p>
                </div>
                <FileText className="w-8 h-8 text-amber-500/40" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10">
                <div>
                  <p className="text-xs text-muted-foreground">ส่งใบเสนอราคาแล้ว · รอคอนเฟิร์ม</p>
                  <p className="font-display text-2xl font-semibold mt-1 text-orange-700 dark:text-orange-300 tabular-nums">
                    {quoteCard.pending_confirm}
                  </p>
                </div>
                <FileText className="w-8 h-8 text-orange-500/40" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
                <div>
                  <p className="text-xs text-muted-foreground">คอนเฟิร์มแล้ว</p>
                  <p className="font-display text-2xl font-semibold mt-1 text-green-700 dark:text-green-300 tabular-nums">
                    {quoteCard.confirmed}
                  </p>
                </div>
                <FileText className="w-8 h-8 text-green-500/40" />
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ============= Wrapper ============= */
export default function DashboardExtraSections() {
  return (
    <>
      <NewCustomersChart />
      <DailyReportTable />
      <FunnelToday />
      <BacklogCard />
      <CurrentStatusGrid />
    </>
  );
}
