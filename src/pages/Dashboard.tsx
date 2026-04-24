import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { MessageSquare, Users, Clock, TrendingUp, Bot, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [c, u, conv, today] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }).gt("unread_count", 0),
        supabase.from("conversations").select("*", { count: "exact", head: true }),
        supabase.from("conversations").select("*", { count: "exact", head: true }).gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
      ]);
      return { customers: c.count ?? 0, unread: u.count ?? 0, totalMsg: conv.count ?? 0, todayMsg: today.count ?? 0 };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(8);
      return data ?? [];
    },
  });

  const cards = [
    { label: "ลูกค้าทั้งหมด", value: stats?.customers ?? "—", icon: Users, color: "text-info" },
    { label: "ยังไม่ได้อ่าน", value: stats?.unread ?? "—", icon: AlertCircle, color: "text-warning" },
    { label: "ข้อความวันนี้", value: stats?.todayMsg ?? "—", icon: MessageSquare, color: "text-primary" },
    { label: "ข้อความทั้งหมด", value: stats?.totalMsg ?? "—", icon: TrendingUp, color: "text-success" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold">ภาพรวมระบบ</h1>
        <p className="text-muted-foreground mt-1">ติดตามสถานะแชทบอทและลูกค้า LINE OA</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="p-5 shadow-soft border-border/60 hover:shadow-elevated transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="font-display text-3xl font-semibold mt-2">{c.value}</p>
              </div>
              <div className={`p-2.5 rounded-lg bg-muted ${c.color}`}><c.icon className="w-5 h-5" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="shadow-soft border-border/60">
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
              <div className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center text-primary-foreground font-semibold">
                {(r.nickname || r.display_name || "?")[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{r.nickname || r.display_name || "ไม่มีชื่อ"}</p>
                  {r.unread_count > 0 && <Badge variant="destructive" className="h-5 px-1.5">{r.unread_count}</Badge>}
                  {!r.ai_active && <Badge variant="secondary" className="h-5 px-1.5"><Bot className="w-3 h-3 mr-1"/>Manual</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{r.last_message_snippet || "—"}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.last_message_at ? formatDistanceToNow(new Date(r.last_message_at), { addSuffix: true, locale: th }) : ""}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
