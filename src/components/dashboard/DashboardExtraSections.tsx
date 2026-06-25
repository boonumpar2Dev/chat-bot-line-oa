import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

      const [custRes, logRes, convRes] = await Promise.all([
        supabase
          .from("customers")
          .select("created_at")
          .gte("created_at", since)
          .limit(10000),
        supabase
          .from("customer_status_log")
          .select("customer_id, new_status, changed_at")
          .gte("changed_at", since)
          .limit(20000),
        supabase
          .from("conversations")
          .select("created_at,sender")
          .gte("created_at", since)
          .eq("sender", "ai"),
      ]);
      if (custRes.error) throw custRes.error;
      if (logRes.error) throw logRes.error;
      if (convRes.error) throw convRes.error;

      const uniqueByStatus = (rows: any[], statuses: string[]) =>
        new Set(rows.filter((l) => statuses.includes(l.new_status)).map((l) => l.customer_id)).size;

      return days.map((day) => {
        const dayKey = ymd(day);
        const newCount = (custRes.data ?? []).filter(
          (c: any) => ymd(new Date(c.created_at)) === dayKey
        ).length;
        const logsToday = (logRes.data ?? []).filter(
          (l: any) => ymd(new Date(l.changed_at)) === dayKey
        );
        const completeCount = uniqueByStatus(logsToday, ["pending_quote"]);
        const quoteCount = uniqueByStatus(logsToday, ["pending_confirm"]);
        const confirmedCount = uniqueByStatus(logsToday, ["confirmed", "confirmed_returning"]);
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

async function fetchFunnelDay(date: Date) {
  const from = startOfDay(date);
  const to = endOfDay(date);

  // 1) ลูกค้าใหม่วันนี้ (created today)
  const { data: newCustomers, error: e1 } = await supabase
    .from("customers")
    .select("id")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (e1) throw e1;
  const newIds = (newCustomers ?? []).map((c: any) => c.id);

  // 2) ดึง transition log ของวันนี้ (รวม old_status เพื่อนับ "ออกไปวันนี้")
  const { data: logs, error: e2 } = await supabase
    .from("customer_status_log")
    .select("customer_id, old_status, new_status")
    .gte("changed_at", from.toISOString())
    .lte("changed_at", to.toISOString())
    .limit(10000);
  if (e2) throw e2;

  const collectIds = (statuses: string[]) => {
    const ids = new Set<string>();
    (logs ?? []).forEach((r: any) => {
      if (statuses.includes(r.new_status)) ids.add(r.customer_id);
    });
    return ids;
  };

  const quoteLogIds = collectIds(["pending_quote"]);
  const confirmLogIds = collectIds(["pending_confirm"]);
  const confirmedLogIds = collectIds(["confirmed", "confirmed_returning"]);
  const completedLogIds = collectIds(["completed"]);

  // ออกจาก stage วันนี้ (old_status = stage นั้น, new_status ≠ stage นั้น)
  const countOut = (stage: string) => {
    const ids = new Set<string>();
    (logs ?? []).forEach((r: any) => {
      if (r.old_status === stage && r.new_status !== stage) ids.add(r.customer_id);
    });
    return ids.size;
  };
  const quoteOutToday = countOut("pending_quote");
  const confirmOutToday = countOut("pending_confirm");

  // 3) ดึง current status ของลูกค้าที่อยู่ใน log วันนี้ (เพื่อนับ "ใหม่วันนี้ที่ยังอยู่")
  const allLogIds = Array.from(
    new Set<string>([
      ...quoteLogIds,
      ...confirmLogIds,
      ...confirmedLogIds,
      ...completedLogIds,
    ])
  );
  const currentStatus = new Map<string, string>();
  if (allLogIds.length > 0) {
    const { data: cs, error: e3 } = await supabase
      .from("customers")
      .select("id,status")
      .in("id", allLogIds);
    if (e3) throw e3;
    (cs ?? []).forEach((c: any) => currentStatus.set(c.id, c.status));
  }

  const filterByCurrent = (ids: Set<string>, allowed: string[]) =>
    Array.from(ids).filter((id) => allowed.includes(currentStatus.get(id) ?? ""));

  // ใหม่วันนี้ที่ยังอยู่ใน stage
  const quoteNewIds = filterByCurrent(quoteLogIds, ["pending_quote"]);
  const confirmNewIds = filterByCurrent(confirmLogIds, ["pending_confirm"]);
  const completedIds = filterByCurrent(completedLogIds, ["completed"]);

  // 4) ดึง "ทุกคน" ที่ตอนนี้ status = stage (รายชื่อจริงสำหรับคลิก, ไม่ใช่แค่ count)
  const [quoteAll, confirmAll] = await Promise.all([
    supabase.from("customers").select("id").eq("status", "pending_quote").limit(10000),
    supabase.from("customers").select("id").eq("status", "pending_confirm").limit(10000),
  ]);
  const quoteAllIds = (quoteAll.data ?? []).map((c: any) => c.id);
  const confirmAllIds = (confirmAll.data ?? []).map((c: any) => c.id);
  const quoteTotalCount = quoteAllIds.length;
  const confirmTotalCount = confirmAllIds.length;
  const quoteNewSet = new Set(quoteNewIds);
  const confirmNewSet = new Set(confirmNewIds);
  const quoteCarry = Math.max(0, quoteTotalCount - quoteNewSet.size);
  const confirmCarry = Math.max(0, confirmTotalCount - confirmNewSet.size);

  // Confirm row (Admin ส่งใบ): สนใจ "วันนี้ส่งใบ" ไม่ใช่ "คงเหลือ"
  // - sentTodayNew = ส่งใบวันนี้ และลูกค้าทักมาวันนี้
  // - sentTodayCarry = ส่งใบวันนี้ แต่ลูกค้าทักมาวันก่อน
  // - backlog = ทั้งหมดที่ status=pending_confirm ตอนนี้ (ไม่จำกัดวัน)
  const newIdSet = new Set(newIds);
  const confirmSentTodayIds = Array.from(confirmLogIds);
  const confirmSentTodayNew = confirmSentTodayIds.filter((id) => newIdSet.has(id)).length;
  const confirmSentTodayCarry = confirmSentTodayIds.length - confirmSentTodayNew;

  // 5) Confirmed วันนี้ = คนที่เข้า confirmed/confirmed_returning วันนี้
  // แยก: ส่งใบวันนี้+คอนเฟิร์มวันนี้ (sameDay) vs ส่งใบวันก่อน+คอนเฟิร์มวันนี้ (carry)
  const confirmedTodayIds = Array.from(confirmedLogIds);
  let confirmedSameDay = 0;
  let confirmedCarry = 0;
  if (confirmedTodayIds.length > 0) {
    const { data: pclogs, error: e4 } = await supabase
      .from("customer_status_log")
      .select("customer_id, changed_at")
      .in("customer_id", confirmedTodayIds)
      .eq("new_status", "pending_confirm")
      .lte("changed_at", to.toISOString())
      .limit(10000);
    if (e4) throw e4;
    const lastPending = new Map<string, string>();
    (pclogs ?? []).forEach((r: any) => {
      const prev = lastPending.get(r.customer_id);
      if (!prev || r.changed_at > prev) lastPending.set(r.customer_id, r.changed_at);
    });
    confirmedTodayIds.forEach((id) => {
      const lp = lastPending.get(id);
      if (lp && new Date(lp) >= from) confirmedSameDay++;
      else if (lp) confirmedCarry++;
      else confirmedSameDay++; // ไม่มี log pending_confirm = นับเป็นวันนี้
    });
  }

  return {
    stages: [
      { key: "new", label: "ลูกค้าใหม่วันนี้", count: newIds.length, totalCount: newIds.length, carryOver: 0, newToday: newIds.length, outToday: 0, customerIds: newIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "quote", label: "ได้ข้อมูลครบ (พร้อมทำใบ)", count: quoteNewSet.size, totalCount: quoteTotalCount, carryOver: quoteCarry, newToday: quoteNewSet.size, outToday: 0, customerIds: quoteAllIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "confirm", label: "Admin ส่งใบเสนอราคา", count: confirmSentTodayIds.length, totalCount: confirmSentTodayIds.length, carryOver: confirmSentTodayCarry, newToday: confirmSentTodayNew, outToday: 0, customerIds: confirmSentTodayIds, backlogCount: confirmTotalCount, backlogIds: confirmAllIds },
      { key: "confirmed", label: "ลูกค้าคอนเฟิร์ม", count: confirmedTodayIds.length, totalCount: confirmedTodayIds.length, carryOver: confirmedCarry, newToday: confirmedSameDay, outToday: 0, customerIds: confirmedTodayIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "completed", label: "จัดงานเสร็จ", count: completedIds.length, totalCount: completedIds.length, carryOver: 0, newToday: completedIds.length, outToday: 0, customerIds: completedIds, backlogCount: 0, backlogIds: [] as string[] },
    ],
    inquiryCount: 0,
    isDayMode: true as boolean,
  };
}



async function fetchFunnelMonth(date: Date) {
  const from = startOfMonth(date);
  const to = endOfMonth(date);

  const { data: custs, error: e1 } = await supabase
    .from("customers")
    .select("id")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .limit(10000);
  if (e1) throw e1;
  const idSet = new Set<string>((custs ?? []).map((c: any) => c.id));
  const newCount = idSet.size;
  const newIds = Array.from(idSet);

  const STAGE_RANK: Record<string, number> = {
    inquiry: 1,
    pending_quote: 2,
    pending_confirm: 3,
    confirmed: 4,
    confirmed_returning: 4,
    completed: 5,
  };
  const highest = new Map<string, number>();

  if (idSet.size > 0) {
    const { data: logs, error: e2 } = await supabase
      .from("customer_status_log")
      .select("customer_id, new_status")
      .in("customer_id", Array.from(idSet))
      .limit(10000);
    if (e2) throw e2;
    (logs ?? []).forEach((r: any) => {
      const rank = STAGE_RANK[r.new_status];
      if (!rank) return;
      const prev = highest.get(r.customer_id) ?? 0;
      if (rank > prev) highest.set(r.customer_id, rank);
    });
  }

  const idsAtLeast = (n: number) => {
    const result: string[] = [];
    highest.forEach((v, id) => {
      if (v >= n) result.push(id);
    });
    return result;
  };

  const quoteIds = idsAtLeast(2);
  const confirmIds = idsAtLeast(3);
  const confirmedIds = idsAtLeast(4);
  const completedIds = idsAtLeast(5);

  return {
    stages: [
      { key: "new", label: "ทักเข้ามา", count: newCount, totalCount: newCount, carryOver: 0, newToday: newCount, outToday: 0, customerIds: newIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "quote", label: "รอใบเสนอราคา", count: quoteIds.length, totalCount: quoteIds.length, carryOver: 0, newToday: quoteIds.length, outToday: 0, customerIds: quoteIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "confirm", label: "รอคอนเฟิร์ม", count: confirmIds.length, totalCount: confirmIds.length, carryOver: 0, newToday: confirmIds.length, outToday: 0, customerIds: confirmIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "confirmed", label: "คอนเฟิร์มแล้ว", count: confirmedIds.length, totalCount: confirmedIds.length, carryOver: 0, newToday: confirmedIds.length, outToday: 0, customerIds: confirmedIds, backlogCount: 0, backlogIds: [] as string[] },
      { key: "completed", label: "จัดงานจบแล้ว", count: completedIds.length, totalCount: completedIds.length, carryOver: 0, newToday: completedIds.length, outToday: 0, customerIds: completedIds, backlogCount: 0, backlogIds: [] as string[] },
    ],
    inquiryCount: Math.max(0, newCount - quoteIds.length),
    isDayMode: false as boolean,
  };
}

function FunnelToday() {
  const nav = useNavigate();
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
    queryFn: () => (mode === "day" ? fetchFunnelDay(dateA) : fetchFunnelMonth(dateA)),
  });
  const queryB = useQuery({
    queryKey: ["funnel-today", mode, ymd(dateB)],
    queryFn: () => (mode === "day" ? fetchFunnelDay(dateB) : fetchFunnelMonth(dateB)),
    enabled: compare,
  });

  const chartData = useMemo(() => {
    const a = queryA.data?.stages ?? [];
    const b = queryB.data?.stages ?? [];
    return FUNNEL_STAGES.map((stage, i) => {
      return {
        key: stage.key,
        label: a[i]?.label ?? (mode === "day" ? stage.labelDay : stage.labelMonth),
        subLabel: stage.subLabel,
        color: stage.color,
        A: a[i]?.count ?? 0,
        B: compare ? b[i]?.count ?? 0 : 0,
        diff: compare ? (a[i]?.count ?? 0) - (b[i]?.count ?? 0) : 0,
        customerIdsA: a[i]?.customerIds ?? [],
        customerIdsB: b[i]?.customerIds ?? [],
        carryOver: a[i]?.carryOver ?? 0,
        totalCount: a[i]?.totalCount ?? a[i]?.count ?? 0,
        newToday: a[i]?.newToday ?? 0,
        outToday: a[i]?.outToday ?? 0,
        backlogCount: a[i]?.backlogCount ?? 0,
        backlogIds: a[i]?.backlogIds ?? [],
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
            <h2 className="font-display font-semibold">{mode === "day" ? "📊 กิจกรรมวันนี้ — เกิดอะไรขึ้น" : "📊 Funnel ลูกค้า — ติดตามกลุ่มเดือนนี้"}</h2>
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
          const isDayMode = queryA.data.isDayMode;
          const firstA = chartData[0]?.A || 1;
          const maxVal = isDayMode
            ? Math.max(...chartData.map((r) => Math.max(r.totalCount, r.B)), 1)
            : Math.max(...chartData.map((r) => Math.max(r.A, r.B)), 1);
          const totalIn = chartData[0]?.A ?? 0;
          const quoteStage = chartData.find((r) => r.key === "quote");
          const quoteCount = quoteStage?.A ?? 0;
          const quoteTotal = quoteStage?.totalCount ?? 0;
          const quoteCarry = quoteStage?.carryOver ?? 0;
          const confirmedCount = chartData.find((r) => r.key === "confirmed")?.A ?? 0;
          const completedCount = chartData.find((r) => r.key === "completed")?.A ?? 0;
          const conv = totalIn > 0 ? Math.round((confirmedCount / totalIn) * 100) : 0;
          const quotePct = totalIn > 0 ? Math.round((quoteCount / totalIn) * 100) : 0;
          return (
            <>
              <div className="space-y-1">
                {chartData.map((row, i) => {
                  const baseVal = isDayMode ? maxVal : firstA;
                  const hasCarry = isDayMode && row.carryOver > 0;
                  const dayDisplay = isDayMode ? row.totalCount : row.A;
                  const pctA = isDayMode
                    ? (row.totalCount / baseVal) * 100
                    : (row.A / baseVal) * 100;
                  const pctNewSeg = hasCarry ? (row.newToday / baseVal) * 100 : 0;
                  const pctCarrySeg = hasCarry ? (row.carryOver / baseVal) * 100 : 0;
                  const clickable = isDayMode ? row.totalCount > 0 : row.A > 0;
                  const pctB = (row.B / baseVal) * 100;
                  const pctOfFirst = firstA > 0 ? Math.round((row.A / firstA) * 100) : 0;
                  const pctOfFirstB = compare && firstA > 0 ? Math.round((row.B / firstA) * 100) : 0;
                  const prev = chartData[i - 1];
                  const dropFromPrev = prev ? Math.max(0, prev.A - row.A) : 0;
                  return (
                    <div key={row.key}>
                      {!isDayMode && i > 0 && (
                        <div className="flex items-center gap-3 py-1 pl-[150px] hidden sm:flex">
                          <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                          <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                            ไปต่อ {row.A} คน
                          </Badge>
                          {dropFromPrev > 0 && (
                            <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">
                              หลุด {dropFromPrev} คน
                            </Badge>
                          )}
                        </div>
                      )}
                      <div
                        className={cn("flex items-center gap-3", clickable && "cursor-pointer hover:bg-muted/20 rounded-md transition-colors")}
                        onClick={() => {
                          if (!clickable || !row.customerIdsA?.length) return;
                          sessionStorage.setItem("funnel_customer_ids", JSON.stringify(row.customerIdsA));
                          sessionStorage.setItem("funnel_label", `${row.label} — ${fmtPicker(dateA)}`);
                          nav("/customers?funnel=1");
                        }}
                      >
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
                            {hasCarry ? (
                              <>
                                <div
                                  className="absolute inset-y-0 left-0 transition-all flex items-center px-3"
                                  style={{ width: `${pctNewSeg}%`, backgroundColor: row.color }}
                                >
                                  {pctNewSeg > 10 && (
                                    <span className="text-xs font-semibold text-white tabular-nums">
                                      +{row.newToday}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="absolute inset-y-0 transition-all flex items-center px-2"
                                  style={{
                                    left: `${pctNewSeg}%`,
                                    width: `${pctCarrySeg}%`,
                                    backgroundColor: row.color,
                                    opacity: 0.4,
                                  }}
                                >
                                  {pctCarrySeg > 10 && (
                                    <span className="text-xs font-semibold text-white tabular-nums">
                                      {row.carryOver}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div
                                className="absolute inset-y-0 left-0 rounded-md transition-all flex items-center px-3"
                                style={{ width: `${pctA}%`, backgroundColor: row.color }}
                              >
                                {pctA > 12 && (
                                  <span className="text-xs font-semibold text-white tabular-nums">
                                    {isDayMode ? row.totalCount : row.A} คน
                                  </span>
                                )}
                              </div>
                            )}
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
                          {isDayMode && (row.key === "quote" || row.key === "confirm" || row.key === "confirmed") && (row.carryOver > 0 || row.newToday > 0 || row.backlogCount > 0) && (
                            <div className="text-[10px] text-muted-foreground mt-1 flex gap-3 flex-wrap items-center">
                              {row.key === "confirmed" ? (
                                <>
                                  <span>ส่งใบวันนี้ <strong>{row.newToday}</strong></span>
                                  <span>+ ส่งใบวันก่อน <strong>{row.carryOver}</strong></span>
                                </>
                              ) : row.key === "confirm" ? (
                                <>
                                  <span>ทักวันนี้+ส่งวันนี้ <strong>{row.newToday}</strong></span>
                                  <span>+ ค้างเก่า+ส่งวันนี้ <strong>{row.carryOver}</strong></span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!row.backlogIds?.length) return;
                                      sessionStorage.setItem("funnel_customer_ids", JSON.stringify(row.backlogIds));
                                      sessionStorage.setItem("funnel_label", `คงเหลือรอคอนเฟิร์ม (ทั้งหมด) — ${fmtPicker(dateA)}`);
                                      nav("/customers?funnel=1");
                                    }}
                                    className="text-primary hover:underline disabled:no-underline disabled:text-muted-foreground"
                                    disabled={!row.backlogCount}
                                  >
                                    คงเหลือรอคอนเฟิร์ม <strong>{row.backlogCount}</strong> →
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span>ใหม่วันนี้ <strong>{row.newToday}</strong></span>
                                  <span>+ ค้างวันก่อน <strong>{row.carryOver}</strong></span>
                                </>
                              )}
                            </div>
                          )}

                        </div>
                        <div className="w-[90px] sm:w-[130px] shrink-0 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-display font-bold text-lg tabular-nums leading-none">
                              {isDayMode ? dayDisplay : row.A}
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
                          {!isDayMode && (
                            <div className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                              {pctOfFirst}%
                              {compare && (
                                <span style={{ color: "#7F77DD" }} className="ml-1">
                                  ({pctOfFirstB}%)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                {isDayMode ? (
                  <>
                    <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#378ADD" }}>
                      <div className="text-[11px] text-muted-foreground">ลูกค้าใหม่</div>
                      <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{totalIn}</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#E24B4A" }}>
                      <div className="text-[11px] text-muted-foreground">รอใบเสนอราคา (คงค้าง)</div>
                      <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{quoteTotal}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        ใหม่ {quoteCount} + ค้าง {quoteCarry}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#1D9E75" }}>
                      <div className="text-[11px] text-muted-foreground">วันนี้คอนเฟิร์ม</div>
                      <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{confirmedCount}</div>
                    </div>

                    <div className="rounded-lg border bg-card p-3 border-l-4" style={{ borderLeftColor: "#7F77DD" }}>
                      <div className="text-[11px] text-muted-foreground">จัดงานเสร็จ</div>
                      <div className="font-display font-bold text-2xl tabular-nums mt-0.5">{completedCount}</div>
                    </div>
                  </>

                ) : (
                  <>
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
                  </>
                )}
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
      <DailyReportTable />
      <FunnelToday />
      <BacklogCard />
      <CurrentStatusGrid />
    </>
  );
}
