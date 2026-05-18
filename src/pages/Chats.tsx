import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, Send, Search, Phone, MapPin, Users as UsersIcon, Calendar, Info, ArrowLeft, Tag, X, Copy, ExternalLink, Smartphone, Paperclip, MessageSquareText, Brain, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import StatusSelector from "@/components/chats/StatusSelector";
import ManualTimerBanner from "@/components/chats/ManualTimerBanner";
import StagedMessageBar from "@/components/chats/StagedMessageBar";
import QuickResponsePopup from "@/components/chats/QuickResponsePopup";
import ImagePreviewModal from "@/components/chats/ImagePreviewModal";

const LIFF_ID = (import.meta as any).env?.VITE_LIFF_ID || "";

// เทมเพลตขอข้อมูลใบเสนอราคา
const QUOTE_FORM_TEMPLATE = `เพื่อให้ทางเราจัดทำใบเสนอราคาได้รวดเร็วและตรงความต้องการ รบกวนแจ้งข้อมูลดังนี้นะคะ 🙏

1. วัน เดือน ปี ที่จัดงาน : 
2. สถานที่จัดงาน : 
3. ชื่อ และเบอร์โทรที่ติดต่อได้ : 
4. จำนวนพระสงฆ์ (รูป) และจำนวนแขกร่วมงาน (ท่าน) : 

ได้รับข้อมูลแล้วจะรีบจัดทำใบเสนอราคาส่งให้นะคะ ✨`;

type Customer = any;
type Conversation = any;

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", returning: "เคยติดต่อ", pending_quote: "รอใบเสนอ", pending_confirm: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก",
};

function getFileType(url = "") {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(l)) return "video";
  return "file";
}

async function uploadToStorage(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `chat-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("line-media").upload(path, file, { upsert: false });
  if (error) { toast.error("อัปโหลดไม่สำเร็จ: " + error.message); return null; }
  return supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl;
}

export default function Chats() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = customers.find(c => c.id === selectedId);

  // Customers + realtime
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("customers").select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
      if (active) { setCustomers(data || []); setLoading(false); }
    };
    load();
    const ch = supabase.channel("customers-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, []);

  // Messages + realtime
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("conversations").select("*")
        .eq("customer_id", selectedId).order("created_at", { ascending: true }).limit(500);
      if (active) setMessages(data || []);
    };
    load();
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

  const updateLocalCustomer = (patch: any) => {
    setCustomers(prev => prev.map(c => c.id === selectedId ? { ...c, ...patch } : c));
  };

  const handleFilesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const urls = (await Promise.all(files.map(uploadToStorage))).filter(Boolean) as string[];
    setStagedFiles(p => [...p, ...urls]);
    setUploading(false);
    e.target.value = "";
  };

  const sendReply = async () => {
    if ((!reply.trim() && stagedFiles.length === 0) || !selected) return;
    setSending(true);
    try {
      const lineMessages: any[] = [];
      for (const url of stagedFiles) {
        const t = getFileType(url);
        if (t === "image") {
          lineMessages.push({ type: "image", originalContentUrl: url, previewImageUrl: url });
        } else if (t === "video") {
          lineMessages.push({ type: "video", originalContentUrl: url, previewImageUrl: url });
        } else {
          lineMessages.push({ type: "text", text: `📎 ${url}` });
        }
      }
      if (reply.trim()) lineMessages.push({ type: "text", text: reply.trim() });

      const { error } = await supabase.functions.invoke("line-send-message", {
        body: { line_user_id: selected.line_user_id, messages: lineMessages, customer_id: selected.id },
      });
      if (error) throw error;
      setReply("");
      setStagedFiles([]);
    } catch (e: any) {
      toast.error("ส่งข้อความไม่สำเร็จ: " + e.message);
    } finally { setSending(false); }
  };

  const toggleAi = async (active: boolean) => {
    if (!selected) return;
    const update: any = { ai_active: active };
    if (active) { update.manual_chat_until = null; update.ai_resumed_at = new Date().toISOString(); }
    await supabase.from("customers").update(update).eq("id", selected.id);
    updateLocalCustomer(update);
    toast.success(active ? "เปิด AI แล้ว" : "ปิด AI แล้ว");
  };

  const updateCustomer = async (patch: any) => {
    if (!selected) return;
    await supabase.from("customers").update(patch).eq("id", selected.id);
    updateLocalCustomer(patch);
    toast.success("บันทึกแล้ว");
  };

  const onSelectQuick = (resp: any) => {
    if (resp.text) setReply(p => p ? p + "\n" + resp.text : resp.text);
    const all = [...(resp.image_urls || []), ...(resp.file_urls || [])];
    if (all.length) setStagedFiles(p => [...p, ...all]);
    setShowQuick(false);
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
              <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="w-4 h-4"/>
              </Button>
              <Avatar>
                {selected.picture_url && <AvatarImage src={selected.picture_url}/>}
                <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                  {(selected.nickname || selected.display_name || "?")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{selected.nickname || selected.display_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusSelector customer={selected} onUpdate={updateLocalCustomer}/>
                  {selected.phone && <span className="text-xs text-muted-foreground">{selected.phone}</span>}
                </div>
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

            {/* Manual timer */}
            <ManualTimerBanner customer={selected} onUpdate={updateLocalCustomer}/>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef as any}>
              <div className="max-w-3xl mx-auto space-y-3">
                {messages.map(m => <MessageBubble key={m.id} m={m} onImageClick={setPreviewImg}/>)}
              </div>
            </ScrollArea>

            {/* Staged files */}
            <StagedMessageBar files={stagedFiles}
              onRemoveFile={(u) => setStagedFiles(p => p.filter(x => x !== u))}
              onClearAll={() => setStagedFiles([])}/>

            {/* Composer */}
            <div className="border-t bg-card p-3 relative">
              <QuickResponsePopup show={showQuick} filter={reply.startsWith("/") ? reply.slice(1) : ""}
                onSelect={onSelectQuick} onClose={() => setShowQuick(false)}/>
              <div className="max-w-3xl mx-auto flex gap-2 items-end">
                <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple
                  onChange={handleFilesPick} className="hidden"/>
                <Button size="icon" variant="ghost" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Paperclip className="w-4 h-4"/>}
                </Button>
                <Button size="icon" variant="ghost" type="button" onClick={() => setShowQuick(s => !s)}>
                  <MessageSquareText className="w-4 h-4"/>
                </Button>
                <Textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="พิมพ์ข้อความ… (Enter ส่ง, /ค้นหาคำตอบสำเร็จรูป)" rows={2} className="resize-none flex-1"/>
                <Button onClick={sendReply} disabled={sending || (!reply.trim() && stagedFiles.length === 0)}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">การส่งข้อความจะปิด AI ชั่วคราว (Manual Chat)</p>
            </div>
          </>
        )}
      </main>

      <ImagePreviewModal url={previewImg} onClose={() => setPreviewImg(null)}/>
    </div>
  );
}

function MessageBubble({ m, onImageClick }: { m: any; onImageClick: (u: string) => void }) {
  const isCustomer = m.sender === "customer";
  const isAdmin = m.sender === "admin";
  const align = isCustomer ? "items-start" : "items-end";
  const bg = isCustomer ? "bg-card border" : isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary";
  const label = isCustomer ? "ลูกค้า" : isAdmin ? "👤 แอดมิน" : "🤖 AI";
  const imgUrls = (m.message.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/gi) || []).slice(0, 5);
  // แยกส่วน OCR ออกจากข้อความ
  const ocrMatch = m.message.match(/📄\s*เนื้อหาในรูป:\s*\n?([\s\S]*)$/);
  const ocrText = ocrMatch?.[1]?.trim() || "";
  let cleaned = m.message
    .replace(/📄\s*เนื้อหาในรูป:[\s\S]*$/, "")
    .replace(/📎\s*https?:\/\/\S+/g, "")
    .replace(/^\[(รูปภาพ|วิดีโอ|ไฟล์|เสียง)\]\s*/g, "")
    .trim();
  return (
    <div className={cn("flex flex-col gap-1", align)}>
      <span className="text-[10px] text-muted-foreground px-2">
        {label}{m.confidence_score != null && ` • ${m.confidence_score}%`}{m.is_fallback && " • fallback"}
      </span>
      {imgUrls.map((u: string) => (
        <img key={u} src={u} alt="" onClick={() => onImageClick(u)}
          className="max-w-[280px] rounded-lg border cursor-pointer hover:opacity-90"/>
      ))}
      {ocrText && (
        <div className="max-w-[80%] rounded-lg border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap break-words text-muted-foreground">
          <div className="flex items-center gap-1 mb-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
            📄 เนื้อหาในรูป (OCR)
          </div>
          {ocrText}
        </div>
      )}
      {cleaned && (
        <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words", bg)}>
          {cleaned}
        </div>
      )}
      <span className="text-[10px] text-muted-foreground px-2">{new Date(m.created_at).toLocaleString("th-TH")}</span>
    </div>
  );
}

function CustomerInfoPanel({ customer, onUpdate }: { customer: any; onUpdate: (p: any) => void }) {
  const [local, setLocal] = useState(customer);
  const [tagInput, setTagInput] = useState("");
  useEffect(() => setLocal(customer), [customer.id]);
  const save = (k: string, v: any) => { setLocal({ ...local, [k]: v }); onUpdate({ [k]: v }); };

  const tags: string[] = Array.isArray(local.tags) ? local.tags : [];
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setLocal({ ...local, tags: next });
    onUpdate({ tags: next });
    setTagInput("");
  };
  const removeTag = (t: string) => {
    const next = tags.filter(x => x !== t);
    setLocal({ ...local, tags: next });
    onUpdate({ tags: next });
  };

  const liffUrl = LIFF_ID
    ? `https://liff.line.me/${LIFF_ID}?uid=${customer.line_user_id}`
    : `${window.location.origin}/liff?uid=${customer.line_user_id}`;
  const copyLiff = async () => {
    try { await navigator.clipboard.writeText(liffUrl); toast.success("คัดลอกลิงก์แล้ว"); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  };

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

      {/* Tags */}
      <div>
        <Label className="text-xs flex items-center gap-1 mb-2"><Tag className="w-3 h-3"/>แท็ก</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มีแท็ก</span>}
          {tags.map(t => (
            <Badge key={t} variant="secondary" className="text-xs gap-1 pr-1">
              {t}
              <button onClick={() => removeTag(t)} className="hover:bg-destructive/20 rounded-full p-0.5">
                <X className="w-3 h-3"/>
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="เพิ่มแท็ก แล้วกด Enter" className="h-8 text-sm"/>
          <Button size="sm" variant="outline" onClick={addTag}>+</Button>
        </div>
      </div>

      <Separator/>

      {/* LIFF */}
      <div>
        <Label className="text-xs flex items-center gap-1 mb-2"><Smartphone className="w-3 h-3"/>ลิงก์ LIFF</Label>
        <div className="flex gap-1">
          <Input value={liffUrl} readOnly className="h-8 text-xs font-mono"/>
          <Button size="sm" variant="outline" onClick={copyLiff} title="คัดลอก"><Copy className="w-3 h-3"/></Button>
          <Button size="sm" variant="outline" asChild title="เปิด">
            <a href={liffUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3"/></a>
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">ส่งให้ทีมเปิดในมือถือ → จัดการสถานะลูกค้าผ่าน LIFF</p>
      </div>

      <Separator/>

      <div className="space-y-3">
        <div><Label className="text-xs">ชื่อเล่น</Label>
          <Input value={local.nickname || ""} onChange={e => setLocal({ ...local, nickname: e.target.value })} onBlur={() => onUpdate({ nickname: local.nickname })}/></div>
        <div><Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3"/>เบอร์โทร</Label>
          <Input value={local.phone || ""} onChange={e => setLocal({ ...local, phone: e.target.value })} onBlur={() => onUpdate({ phone: local.phone })}/></div>
        <div><Label className="text-xs">เลขผู้เสียภาษี / Tag</Label>
          <Input value={local.tax_id || ""} onChange={e => setLocal({ ...local, tax_id: e.target.value })} onBlur={() => onUpdate({ tax_id: local.tax_id })}/></div>
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
