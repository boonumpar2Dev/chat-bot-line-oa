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
function NewCustomersChart() {
  const [range, setRange] = useState<7 | 30>(7);
  const { data, isLoading, error } = useQuery({
    queryKey: ["new-customers-chart", range],
    queryFn: async () => {
      const since = startOfDay(new Date());
      since.setDate(since.getDate() - (range - 1));
      const { data, error } = await supabase
        .from("customers")
        .select("created_at")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      const buckets: Record<string, number> = {};
      for (let i = 0; i < range; i++) {
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
    queryKey: ["daily-report-7d"],
    queryFn: async () => {
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = startOfDay(new Date());
        d.setDate(d.getDate() - i);
        days.push(d);
      }
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
        <h2 className="font-display font-semibold">รายงานรายวัน (7 วันล่าสุด)</h2>
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

/* ============= Section 3: Funnel ============= */
type FunnelMode = "day" | "month";
const FUNNEL_STAGES: { key: string; label: string; statuses: string[]; color: string; subLabel?: string }[] = [
  { key: "new", label: "ทักเข้ามา", color: "#378ADD", statuses: ["new", "returning", "inquiry", "pending_quote", "pending_confirm", "confirmed", "confirmed_returning", "completed", "postponed", "cancelled"] },
  { key: "inquiry", label: "สอบถามข้อมูล", color: "#378ADD", statuses: ["inquiry", "pending_quote", "pending_confirm", "confirmed", "confirmed_returning", "completed", "postponed"] },
  { key: "quote", label: "รอใบเสนอราคา", color: "#E24B4A", subLabel: "Admin ต้องทำ", statuses: ["pending_quote", "pending_confirm", "confirmed", "confirmed_returning", "completed", "postponed"] },
  { key: "confirm", label: "รอคอนเฟิร์ม", color: "#EF9F27", statuses: ["pending_confirm", "confirmed", "confirmed_returning", "completed", "postponed"] },
  { key: "confirmed", label: "คอนเฟิร์มแล้ว", color: "#1D9E75", statuses: ["confirmed", "confirmed_returning", "completed", "postponed"] },
  { key: "completed", label: "จัดงานจบแล้ว", color: "#7F77DD", subLabel: "auto-close", statuses: ["completed"] },
];

async function fetchFunnel(mode: FunnelMode, date: Date) {
  const from = mode === "day" ? startOfDay(date) : startOfMonth(date);
  const to = mode === "day" ? endOfDay(date) : endOfMonth(date);
  const { data, error } = await supabase
    .from("customers")
    .select("status")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .limit(10000);
  if (error) throw error;
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  });
  return FUNNEL_STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    count: s.statuses.reduce((sum, st) => sum + (counts[st] ?? 0), 0),
  }));
}

function FunnelSection() {
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
    return nd;
  };

  const queryA = useQuery({
    queryKey: ["funnel", mode, ymd(dateA)],
    queryFn: () => fetchFunnel(mode, dateA),
  });
  const queryB = useQuery({
    queryKey: ["funnel", mode, ymd(dateB)],
    queryFn: () => fetchFunnel(mode, dateB),
    enabled: compare,
  });

  const chartData = useMemo(() => {
    const a = queryA.data ?? [];
    const b = queryB.data ?? [];
    return a.map((row, i) => ({
      label: row.label,
      A: row.count,
      B: compare ? b[i]?.count ?? 0 : 0,
      diff: compare ? row.count - (b[i]?.count ?? 0) : 0,
    }));
  }, [queryA.data, queryB.data, compare]);

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
            <h2 className="font-display font-semibold">Funnel ลูกค้า</h2>
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
        {queryA.data && (
          <div className="space-y-2">
            {chartData.map((row) => {
              const maxVal = Math.max(...chartData.map((r) => Math.max(r.A, r.B)), 1);
              const pctA = (row.A / maxVal) * 100;
              const pctB = (row.B / maxVal) * 100;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold tabular-nums">{row.A}</span>
                      {compare && (
                        <>
                          <span className="text-muted-foreground tabular-nums">vs {row.B}</span>
                          {row.diff !== 0 && (
                            <Badge
                              variant={row.diff > 0 ? "default" : "destructive"}
                              className="h-4 px-1 text-[10px]"
                            >
                              {row.diff > 0 ? "+" : ""}
                              {row.diff}
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="relative h-6 bg-muted rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary transition-all"
                      style={{ width: `${pctA}%` }}
                    />
                    {compare && (
                      <div
                        className="absolute inset-y-0 left-0 bg-foreground/30 transition-all border-r-2 border-foreground/60"
                        style={{ width: `${pctB}%`, top: "60%", height: "40%" }}
                      />
                    )}
                  </div>
                </div>
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
      const { data, error } = await supabase
        .from("customers")
        .select("status,updated_at")
        .limit(10000);
      if (error) throw error;
      const now = Date.now();
      const grouped: Record<string, { count: number; waitMs: number[] }> = {};
      (data ?? []).forEach((r: any) => {
        const s = r.status as string;
        if (!grouped[s]) grouped[s] = { count: 0, waitMs: [] };
        grouped[s].count++;
        if (r.updated_at) grouped[s].waitMs.push(now - new Date(r.updated_at).getTime());
      });
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
      <FunnelSection />
      <CurrentStatusGrid />
    </>
  );
}
