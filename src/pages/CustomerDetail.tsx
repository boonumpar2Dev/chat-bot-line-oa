import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, MessageSquare, Crown, History, Sparkles, Calendar, Users as UsersIcon, MapPin, Receipt } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import CustomerInfoPanel from "@/components/customers/CustomerInfoPanel";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", returning: "เคยติดต่อ", pending_quote: "รอใบเสนอ",
  pending_confirm: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก",
};

function tierOf(c: any): "vip" | "returning" | "active" | "new" {
  if (c.status === "confirmed" || (c.clv_amount || 0) >= 50000) return "vip";
  if (c.status === "returning" || (c.clv_amount || 0) > 0) return "returning";
  const last = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  if (last && Date.now() - last < 30 * 86400000) return "active";
  return "new";
}

const TIER_LABEL = { vip: "VIP", returning: "เคยติดต่อ", active: "Active", new: "ใหม่" };
const TIER_COLOR: Record<string, string> = {
  vip: "bg-gradient-to-r from-amber-400 to-yellow-500 text-white border-0",
  returning: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  new: "bg-muted text-muted-foreground border-border",
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: c }, { data: msgs }, { data: evs }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("conversations").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("customer_events").select("*").eq("customer_id", id).order("event_date", { ascending: false, nullsFirst: false }),
      ]);
      if (!active) return;
      setCustomer(c);
      setMessages((msgs || []).reverse());
      setEvents(evs || []);
      setLoading(false);
    })();

    // Realtime updates for this customer
    const ch = supabase.channel(`customer-detail-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${id}` },
        (payload: any) => { if (active) setCustomer((prev: any) => ({ ...prev, ...payload.new })); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${id}` },
        (payload: any) => { if (active) setMessages(p => [...p, payload.new].slice(-20)); })
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [id]);

  const updateCustomer = (patch: any) => setCustomer((prev: any) => ({ ...prev, ...patch }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2"/> กำลังโหลด...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">ไม่พบลูกค้ารายนี้</p>
        <Button variant="outline" onClick={() => nav("/customers")}><ArrowLeft className="w-4 h-4 mr-1"/> กลับรายการลูกค้า</Button>
      </div>
    );
  }

  const tier = tierOf(customer);

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/customers")} aria-label="กลับ"><ArrowLeft className="w-4 h-4"/></Button>
          <Avatar className="w-10 h-10">
            <AvatarImage src={customer.picture_url} alt={customer.display_name}/>
            <AvatarFallback>{(customer.display_name || "?")[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg truncate">{customer.nickname || customer.display_name || "ไม่ระบุชื่อ"}</h1>
              {tier === "vip" && <Crown className="w-4 h-4 text-amber-500 shrink-0"/>}
            </div>
            <div className="flex gap-1.5 mt-0.5">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", TIER_COLOR[tier])}>{TIER_LABEL[tier]}</Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{STATUS_LABEL[customer.status] || customer.status}</Badge>
            </div>
          </div>
          <Button size="sm" onClick={() => nav(`/chats?customer=${customer.id}`)}>
            <MessageSquare className="w-4 h-4 mr-1.5"/> เปิดแชท
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left: data panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary */}
          {customer.conversation_summary && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-primary"/> สรุปแชท (AI)
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{customer.conversation_summary}</p>
            </Card>
          )}

          {/* Event history */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
              <History className="w-4 h-4 text-primary"/> ประวัติงาน ({events.length})
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">ยังไม่มีประวัติงาน</p>
            ) : (
              <div className="space-y-3">
                {events.map(e => (
                  <div key={e.id} className="border-l-2 border-primary/40 pl-3 pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-medium text-sm">{e.package_name || e.event_type || "งาน"}</p>
                      {e.total_amount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Receipt className="w-3 h-3 mr-1"/> {Number(e.total_amount).toLocaleString()} บาท
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                      {e.event_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(e.event_date), "d MMM yyyy", { locale: th })}</span>}
                      {e.guest_count && <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3"/> {e.guest_count} ท่าน</span>}
                      {e.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {e.venue}</span>}
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{e.notes}"</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent messages */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="w-4 h-4 text-primary"/> ข้อความล่าสุด
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => nav(`/chats?customer=${customer.id}`)}>
                ดูทั้งหมด →
              </Button>
            </div>
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">ยังไม่มีข้อความ</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messages.map(m => {
                  const fromCustomer = m.sender === "customer";
                  return (
                    <div key={m.id} className={cn("flex", fromCustomer ? "justify-start" : "justify-end")}>
                      <div className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                        fromCustomer ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                      )}>
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p className={cn("text-[10px] mt-1 opacity-60", !fromCustomer && "text-right")}>
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: th })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: edit panel */}
        <div className="lg:col-span-1">
          <Card className="overflow-hidden sticky top-20">
            <div className="px-4 py-2.5 border-b bg-muted/30">
              <h2 className="font-semibold text-sm">ข้อมูล & การตั้งค่า</h2>
            </div>
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
              <CustomerInfoPanel customer={customer} onUpdate={updateCustomer} statusLabels={STATUS_LABEL}/>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
