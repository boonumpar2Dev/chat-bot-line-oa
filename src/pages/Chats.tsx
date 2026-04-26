import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Send, Search, Bot, BotOff, Clock, Phone, MapPin, Users as UsersIcon, Calendar, Info, ArrowLeft, Tag, X, Copy, ExternalLink, Smartphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";

const LIFF_ID = (import.meta as any).env?.VITE_LIFF_ID || "";

type Customer = any;
type Conversation = any;

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", returning: "เคยติดต่อ", pending_quote: "รอใบเสนอ", pending_confirm: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก",
};

export default function Chats() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const selected = customers.find(c => c.id === selectedId);

  // Load customers + realtime
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
      if (active) { setCustomers(data || []); setLoading(false); }
    };
    load();
    const ch = supabase.channel("customers-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);

  // Load messages + realtime when selected
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("conversations").select("*").eq("customer_id", selectedId).order("created_at", { ascending: true }).limit(500);
      if (active) setMessages(data || []);
    };
    load();
    // mark read
    supabase.from("customers").update({ unread_count: 0 }).eq("id", selectedId).then();
    const ch = supabase.channel(`conv-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${selectedId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Conversation]))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      (c.display_name || "").toLowerCase().includes(q) ||
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q)
    );
  }, [customers, search]);

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("line-send-message", {
        body: { line_user_id: selected.line_user_id, message: reply, customer_id: selected.id },
      });
      if (error) throw error;
      setReply("");
    } catch (e: any) {
      toast.error("ส่งข้อความไม่สำเร็จ: " + e.message);
    } finally { setSending(false); }
  };

  const toggleAi = async (active: boolean) => {
    if (!selected) return;
    const update: any = { ai_active: active };
    if (active) { update.manual_chat_until = null; update.ai_resumed_at = new Date().toISOString(); }
    await supabase.from("customers").update(update).eq("id", selected.id);
    toast.success(active ? "เปิด AI แล้ว" : "ปิด AI แล้ว (Manual Chat)");
  };

  const updateCustomer = async (patch: any) => {
    if (!selected) return;
    await supabase.from("customers").update(patch).eq("id", selected.id);
    toast.success("บันทึกแล้ว");
  };

  return (
    <div className="h-full flex">
      {/* Customer list */}
      <aside className={cn("w-full lg:w-80 border-r flex flex-col bg-card", selectedId && "hidden lg:flex")}>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground"/>
            <Input placeholder="ค้นหาชื่อ/เบอร์" value={search} onChange={e => setSearch(e.target.value)} className="pl-9"/>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading && <div className="p-6 flex justify-center"><Loader2 className="animate-spin"/></div>}
          {!loading && filtered.length === 0 && <p className="p-6 text-sm text-center text-muted-foreground">ยังไม่มีลูกค้า</p>}
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn("w-full text-left p-3 flex gap-3 border-b hover:bg-accent/50 transition", selectedId === c.id && "bg-accent")}>
              <Avatar className="w-10 h-10 shrink-0">
                {c.picture_url && <AvatarImage src={c.picture_url}/>}
                <AvatarFallback className="bg-brand-gradient text-primary-foreground text-xs">
                  {(c.nickname || c.display_name || "?")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="font-medium text-sm truncate">{c.nickname || c.display_name || "ไม่ระบุ"}</p>
                  {c.last_message_at && <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {formatDistanceToNow(new Date(c.last_message_at), { locale: th, addSuffix: false })}
                  </span>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message_snippet || "—"}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] py-0 h-4">{STATUS_LABEL[c.status] || c.status}</Badge>
                  {!c.ai_active && <Badge variant="secondary" className="text-[10px] py-0 h-4">Manual</Badge>}
                  {c.unread_count > 0 && <Badge className="text-[10px] py-0 h-4 ml-auto">{c.unread_count}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </aside>

      {/* Chat thread */}
      <main className={cn("flex-1 flex flex-col bg-background min-w-0", !selectedId && "hidden lg:flex")}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">เลือกลูกค้าจากรายการเพื่อดูแชท</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b bg-card p-3 flex items-center gap-3">
              <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSelectedId(null)}><ArrowLeft className="w-4 h-4"/></Button>
              <Avatar>
                {selected.picture_url && <AvatarImage src={selected.picture_url}/>}
                <AvatarFallback className="bg-brand-gradient text-primary-foreground">{(selected.nickname || selected.display_name || "?")[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{selected.nickname || selected.display_name}</p>
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[selected.status] || selected.status}{selected.phone ? ` • ${selected.phone}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="ai-tog" className="text-xs hidden sm:inline">AI</Label>
                <Switch id="ai-tog" checked={selected.ai_active} onCheckedChange={toggleAi}/>
              </div>
              <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="ghost"><Info className="w-4 h-4"/></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[380px] overflow-y-auto">
                  <CustomerInfoPanel customer={selected} onUpdate={updateCustomer}/>
                </SheetContent>
              </Sheet>
            </div>

            {/* Manual timer banner */}
            {!selected.ai_active && selected.manual_chat_until && new Date(selected.manual_chat_until) > new Date() && (
              <div className="bg-warning/10 text-warning-foreground border-b px-4 py-2 text-xs flex items-center gap-2">
                <Clock className="w-3 h-3"/>
                Manual Chat — AI จะกลับมาเปิดอัตโนมัติ {formatDistanceToNow(new Date(selected.manual_chat_until), { locale: th, addSuffix: true })}
                <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => toggleAi(true)}>ปลุกบอท</Button>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef as any}>
              <div className="max-w-3xl mx-auto space-y-3">
                {messages.map(m => <MessageBubble key={m.id} m={m}/>)}
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="border-t bg-card p-3">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" rows={2} className="resize-none"/>
                <Button onClick={sendReply} disabled={sending || !reply.trim()} className="h-auto">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">การส่งข้อความจะปิด AI ชั่วคราวอัตโนมัติ (Manual Chat)</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function MessageBubble({ m }: { m: any }) {
  const isCustomer = m.sender === "customer";
  const isAdmin = m.sender === "admin";
  const align = isCustomer ? "items-start" : "items-end";
  const bg = isCustomer ? "bg-card border" : isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary";
  const label = isCustomer ? "ลูกค้า" : isAdmin ? "👤 แอดมิน" : "🤖 AI";
  // Extract image URLs from message
  const imgUrls = (m.message.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/gi) || []).slice(0, 5);
  const cleaned = m.message.replace(/📎\s*https?:\/\/\S+/g, "").trim();
  return (
    <div className={cn("flex flex-col gap-1", align)}>
      <span className="text-[10px] text-muted-foreground px-2">{label}{m.confidence_score != null && ` • ${m.confidence_score}%`}{m.is_fallback && " • fallback"}</span>
      <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words", bg)}>
        {cleaned}
      </div>
      {imgUrls.map((u: string) => (
        <img key={u} src={u} alt="" className="max-w-[280px] rounded-lg border"/>
      ))}
      <span className="text-[10px] text-muted-foreground px-2">{new Date(m.created_at).toLocaleString("th-TH")}</span>
    </div>
  );
}

function CustomerInfoPanel({ customer, onUpdate }: { customer: any; onUpdate: (p: any) => void }) {
  const [local, setLocal] = useState(customer);
  useEffect(() => setLocal(customer), [customer.id]);
  const save = (k: string, v: any) => { setLocal({ ...local, [k]: v }); onUpdate({ [k]: v }); };
  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center gap-3">
        <Avatar className="w-14 h-14">
          {customer.picture_url && <AvatarImage src={customer.picture_url}/>}
          <AvatarFallback className="bg-brand-gradient text-primary-foreground">{(customer.display_name || "?")[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold truncate">{customer.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">{customer.line_user_id}</p>
        </div>
      </div>
      <Separator/>
      <div className="space-y-3">
        <div><Label className="text-xs">ชื่อเล่น</Label>
          <Input value={local.nickname || ""} onChange={e => setLocal({ ...local, nickname: e.target.value })} onBlur={() => onUpdate({ nickname: local.nickname })}/></div>
        <div><Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3"/>เบอร์โทร</Label>
          <Input value={local.phone || ""} onChange={e => setLocal({ ...local, phone: e.target.value })} onBlur={() => onUpdate({ phone: local.phone })}/></div>
        <div><Label className="text-xs">สถานะ</Label>
          <Select value={local.status} onValueChange={v => save("status", v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3"/>วันจัดงาน</Label>
          <Input type="date" value={local.event_date || ""} onChange={e => setLocal({ ...local, event_date: e.target.value })} onBlur={() => onUpdate({ event_date: local.event_date || null })}/></div>
        <div><Label className="text-xs">ประเภทงาน</Label>
          <Input value={local.event_type || ""} onChange={e => setLocal({ ...local, event_type: e.target.value })} onBlur={() => onUpdate({ event_type: local.event_type })}/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs flex items-center gap-1"><UsersIcon className="w-3 h-3"/>จำนวน</Label>
            <Input type="number" value={local.guest_count || ""} onChange={e => setLocal({ ...local, guest_count: parseInt(e.target.value) || null })} onBlur={() => onUpdate({ guest_count: local.guest_count })}/></div>
          <div><Label className="text-xs">CLV</Label>
            <Input type="number" value={local.clv_amount || 0} onChange={e => setLocal({ ...local, clv_amount: parseFloat(e.target.value) || 0 })} onBlur={() => onUpdate({ clv_amount: local.clv_amount })}/></div>
        </div>
        <div><Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3"/>สถานที่</Label>
          <Input value={local.venue || ""} onChange={e => setLocal({ ...local, venue: e.target.value })} onBlur={() => onUpdate({ venue: local.venue })}/></div>
        <div><Label className="text-xs">โน้ตแอดมิน</Label>
          <Textarea rows={3} value={local.admin_notes || ""} onChange={e => setLocal({ ...local, admin_notes: e.target.value })} onBlur={() => onUpdate({ admin_notes: local.admin_notes })}/></div>
      </div>
    </div>
  );
}
