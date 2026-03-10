import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { Users, MessageSquare, CheckCircle, Clock, TrendingUp, ArrowUpRight, Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format, subDays, startOfDay, isToday } from "date-fns";
import SLAAlerts from "@/components/dashboard/SLAAlerts";
import CLVTable from "@/components/dashboard/CLVTable";
import { th } from "date-fns/locale";

const PIE_COLORS = ["hsl(210, 92%, 55%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(280, 60%, 55%)", "hsl(220, 14%, 70%)"];

const statusLabel = (s) => ({
  new: "ลูกค้าใหม่", returning: "ลูกค้าเก่า",
  pending_quote: "รอใบเสนอราคา", pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม", cancelled: "ยกเลิก",
}[s] || s);

const statusBadge = (s) => ({
  new: "badge-new", returning: "badge-new",
  pending_quote: "badge-pending", pending_confirm: "badge-pending",
  confirmed: "badge-confirmed", cancelled: "badge-cancelled",
}[s] || "badge-new");

const formatTimeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
};

export default function Dashboard() {
  const [customers, setCustomers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [slaHours, setSlaHours] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [custs, convs, settings] = await Promise.all([
        base44.entities.Customer.list("-created_date", 500),
        base44.entities.Conversation.list("-created_date", 500),
        base44.entities.AppSettings.filter({ key: "ai_config" }),
      ]);
      setCustomers(custs || []);
      setConversations(convs || []);
      if (settings?.[0]) setSlaHours(settings[0].sla_hours || 24);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- Stats ---
  const totalCustomers = customers.length;
  const todayChats = conversations.filter((c) => isToday(new Date(c.created_date))).length;
  const confirmed = customers.filter((c) => c.status === "confirmed").length;
  const pending = customers.filter((c) => c.status === "pending_confirm" || c.status === "pending_quote").length;

  const stats = [
    { label: "ลูกค้าทั้งหมด", value: totalCustomers.toLocaleString(), icon: Users, color: "bg-blue-100 text-blue-600", accent: "#3b82f6" },
    { label: "แชทวันนี้", value: todayChats.toLocaleString(), icon: MessageSquare, color: "bg-green-100 text-green-600", accent: "#10b981" },
    { label: "รอคอนเฟิร์ม", value: pending.toLocaleString(), icon: Clock, color: "bg-yellow-100 text-yellow-600", accent: "#f59e0b" },
    { label: "ยอดคอนเฟิร์ม", value: confirmed.toLocaleString(), icon: CheckCircle, color: "bg-emerald-100 text-emerald-600", accent: "#059669" },
  ];

  // --- Weekly chart: new customers per day (last 7 days) ---
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(new Date(), 6 - i);
    const label = format(day, "EEE", { locale: th });
    const count = customers.filter((c) => {
      const d = new Date(c.created_date);
      return format(d, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
    }).length;
    return { name: label, value: count };
  });

  // --- Status breakdown pie ---
  const statusGroups = ["new", "returning", "pending_confirm", "confirmed", "cancelled"].map((s) => ({
    name: statusLabel(s),
    value: customers.filter((c) => c.status === s).length,
  })).filter((d) => d.value > 0);

  // --- Monthly trend: customers created per month (last 6 months) ---
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = format(d, "yyyy-MM");
    const label = format(d, "LLL", { locale: th });
    const leads = customers.filter((c) => format(new Date(c.created_date), "yyyy-MM") === key).length;
    const conf = customers.filter((c) => c.status === "confirmed" && format(new Date(c.created_date), "yyyy-MM") === key).length;
    return { name: label, leads, confirmed: conf };
  });

  // --- Recent customers ---
  const recentCustomers = [...customers].slice(0, 5);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">ภาพรวมธุรกิจและสถิติลูกค้า</p>
      </div>

      {/* SLA Alerts */}
      <SLAAlerts customers={customers} slaHours={slaHours} />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card" style={{ borderTop: `3px solid ${s.accent}` }}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
            </div>
            <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" /> ลูกค้าใหม่รายสัปดาห์
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="ลูกค้า" fill="hsl(160,84%,39%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="stat-card">
          <h3 className="font-semibold text-foreground mb-4">สถานะลูกค้า</h3>
          {statusGroups.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">ยังไม่มีข้อมูล</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusGroups} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusGroups.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {statusGroups.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="ml-auto font-semibold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4">แนวโน้มรายเดือน</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="leads" name="ลูกค้าทั้งหมด" stroke="hsl(210,92%,55%)" fill="rgba(59,130,246,0.1)" strokeWidth={2} />
              <Area type="monotone" dataKey="confirmed" name="คอนเฟิร์ม" stroke="hsl(160,84%,39%)" fill="rgba(16,185,129,0.1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="stat-card">
          <h3 className="font-semibold text-foreground mb-4">ลูกค้าล่าสุด</h3>
          {recentCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีลูกค้า</div>
          ) : (
            <div className="space-y-3">
              {recentCustomers.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  {c.picture_url ? (
                    <img src={c.picture_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                      {(c.display_name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{c.nickname || c.display_name || "ไม่ทราบชื่อ"}</div>
                    <div className="text-xs text-muted-foreground">{c.event_type || "-"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`badge-status ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span>
                    <div className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(c.created_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CLV Section */}
      <CLVTable customers={customers} />
    </div>
  );
}