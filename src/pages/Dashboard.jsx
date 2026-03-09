import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { Users, MessageSquare, FileText, CheckCircle, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

const leadsData = [
  { name: "จ.", value: 24 }, { name: "อ.", value: 18 }, { name: "พ.", value: 32 },
  { name: "พฤ.", value: 28 }, { name: "ศ.", value: 45 }, { name: "ส.", value: 12 }, { name: "อา.", value: 8 },
];

const monthlyData = [
  { name: "ม.ค.", leads: 120, confirmed: 45 }, { name: "ก.พ.", leads: 150, confirmed: 52 },
  { name: "มี.ค.", leads: 180, confirmed: 68 }, { name: "เม.ย.", leads: 160, confirmed: 55 },
  { name: "พ.ค.", leads: 210, confirmed: 78 }, { name: "มิ.ย.", leads: 195, confirmed: 72 },
];

const intentData = [
  { name: "ขอดูเมนู/แพ็กเกจ", value: 35 }, { name: "สอบถามราคา", value: 28 },
  { name: "จองวันจัดงาน", value: 18 }, { name: "ขอใบเสนอราคา", value: 12 }, { name: "อื่นๆ", value: 7 },
];

const PIE_COLORS = ["hsl(210, 92%, 55%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(280, 60%, 55%)", "hsl(220, 14%, 70%)"];

const stats = [
  { label: "ลูกค้าทั้งหมด", value: "1,284", change: "+12.5%", up: true, icon: Users, color: "bg-blue-100 text-blue-600" },
  { label: "แชทวันนี้", value: "47", change: "+8.3%", up: true, icon: MessageSquare, color: "bg-green-100 text-green-600" },
  { label: "ใบเสนอราคา", value: "23", change: "-2.1%", up: false, icon: FileText, color: "bg-yellow-100 text-yellow-600" },
  { label: "ยอดคอนเฟิร์ม", value: "156", change: "+18.7%", up: true, icon: CheckCircle, color: "bg-emerald-100 text-emerald-600" },
];

const recentLeads = [
  { name: "คุณสมชาย", status: "ลูกค้าใหม่", intent: "ขอดูเมนู", time: "5 นาทีที่แล้ว", badge: "badge-new" },
  { name: "คุณวิภา", status: "รอคอนเฟิร์ม", intent: "จองวันจัดงาน", time: "12 นาทีที่แล้ว", badge: "badge-pending" },
  { name: "คุณธนา", status: "คอนเฟิร์ม", intent: "ขอใบเสนอราคา", time: "1 ชม.ที่แล้ว", badge: "badge-confirmed" },
  { name: "คุณมาลี", status: "ยกเลิก", intent: "สอบถามราคา", time: "2 ชม.ที่แล้ว", badge: "badge-cancelled" },
  { name: "คุณปิยะ", status: "ลูกค้าใหม่", intent: "สอบถามราคา", time: "3 ชม.ที่แล้ว", badge: "badge-new" },
];

export default function Dashboard() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">ภาพรวมธุรกิจและสถิติลูกค้า</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${s.up ? "text-green-600" : "text-red-500"}`}>
                {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {s.change}
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />Leads รายสัปดาห์
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={leadsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(160,84%,39%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="stat-card">
          <h3 className="font-semibold text-foreground mb-4">หัวข้อที่สอบถาม</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={intentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {intentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {intentData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-semibold text-foreground">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4">แนวโน้มรายเดือน</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="leads" stroke="hsl(210,92%,55%)" fill="rgba(59,130,246,0.1)" strokeWidth={2} />
              <Area type="monotone" dataKey="confirmed" stroke="hsl(160,84%,39%)" fill="rgba(16,185,129,0.1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="stat-card">
          <h3 className="font-semibold text-foreground mb-4">ลูกค้าล่าสุด</h3>
          <div className="space-y-3">
            {recentLeads.map((l) => (
              <div key={l.name + l.time} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  {l.name.charAt(3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.intent}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`badge-status ${l.badge}`}>{l.status}</span>
                  <div className="text-[10px] text-muted-foreground mt-1">{l.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}