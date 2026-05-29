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
import { Loader2, Send, Search, Phone, MapPin, Users as UsersIcon, Calendar, Info, ArrowLeft, Tag, X, Copy, ExternalLink, Smartphone, Paperclip, MessageSquareText, Brain, FileText, Eraser, Sparkles, BookmarkCheck, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import StatusSelector from "@/components/chats/StatusSelector";
import ManualTimerBanner from "@/components/chats/ManualTimerBanner";
import StagedMessageBar from "@/components/chats/StagedMessageBar";
import QuickResponsePopup from "@/components/chats/QuickResponsePopup";
import ImagePreviewModal from "@/components/chats/ImagePreviewModal";
import CustomerInfoPanel from "@/components/customers/CustomerInfoPanel";

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
  const [msgSearch, setMsgSearch] = useState("");
  const [trainText, setTrainText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Pagination + server-side search
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length >= 2;

  const selected = customers.find(c => c.id === selectedId);

  // Initial load + reload when search changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(0);
    setHasMore(true);
    (async () => {
      let q = supabase.from("customers").select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (isSearching) {
        const s = debouncedSearch.replace(/[%,]/g, "");
        q = q.or(`display_name.ilike.%${s}%,nickname.ilike.%${s}%,phone.ilike.%${s}%,line_user_id.ilike.%${s}%`).limit(100);
      } else {
        q = q.range(0, PAGE_SIZE - 1);
      }
      const { data } = await q;
      if (!active) return;
      setCustomers(data || []);
      setHasMore(!isSearching && (data?.length || 0) === PAGE_SIZE);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [debouncedSearch, isSearching]);

  // Realtime: patch in place (no full reload)
  useEffect(() => {
    const ch = supabase.channel("customers-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload: any) => {
        const newRow: any = payload.new;
        const oldRow: any = payload.old;
        if (payload.eventType === "DELETE") {
          if (oldRow?.id) setCustomers(prev => prev.filter(c => c.id !== oldRow.id));
          return;
        }
        if (!newRow?.id) return;
        setCustomers(prev => {
          const idx = prev.findIndex(c => c.id === newRow.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...newRow };
            return next.sort((a, b) =>
              new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
            );
          }
          if (payload.eventType === "INSERT" && !isSearching) return [newRow, ...prev];
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isSearching]);

  // Infinite scroll
  const loadMore = async () => {
    if (loadingMore || !hasMore || isSearching) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase.from("customers").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(from, to);
    setCustomers(prev => {
      const ids = new Set(prev.map(c => c.id));
      return [...prev, ...(data || []).filter((c: any) => !ids.has(c.id))];
    });
    setHasMore((data?.length || 0) === PAGE_SIZE);
    setPage(nextPage);
    setLoadingMore(false);
  };

  useEffect(() => {
    if (!sentinelRef.current || isSearching || !hasMore) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: "200px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [page, hasMore, loadingMore, isSearching, customers.length]);


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

  // Customers found by searching inside message content
  const [msgMatchIds, setMsgMatchIds] = useState<Set<string>>(new Set());
  const [msgSnippets, setMsgSnippets] = useState<Record<string, string>>({});
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setMsgMatchIds(new Set()); setMsgSnippets({}); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("conversations")
        .select("customer_id, message")
        .ilike("message", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(200);
      const ids = new Set<string>();
      const snip: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        if (!r.customer_id) return;
        ids.add(r.customer_id);
        if (!snip[r.customer_id]) snip[r.customer_id] = (r.message || "").slice(0, 80);
      });
      setMsgMatchIds(ids); setMsgSnippets(snip);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch customers found by message search that aren't already loaded
  useEffect(() => {
    if (msgMatchIds.size === 0) return;
    const missing = Array.from(msgMatchIds).filter(id => !customers.some(c => c.id === id));
    if (!missing.length) return;
    supabase.from("customers").select("*").in("id", missing).then(({ data }) => {
      if (!data?.length) return;
      setCustomers(prev => {
        const ids = new Set(prev.map(c => c.id));
        return [...prev, ...data.filter((c: any) => !ids.has(c.id))];
      });
    });
  }, [msgMatchIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      (c.display_name || "").toLowerCase().includes(q) ||
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.line_user_id || "").toLowerCase().includes(q) ||
      msgMatchIds.has(c.id)
    );
  }, [customers, search, msgMatchIds]);

  const updateLocalCustomer = (patch: any) => {
    setCustomers(prev => prev.map(c => c.id === selectedId ? { ...c, ...patch } : c));
  };

  const [clearingChat, setClearingChat] = useState(false);
  const clearThisChat = async () => {
    if (!selectedId) return;
    setClearingChat(true);
    try {
      const { error: delErr } = await supabase.from("conversations").delete().eq("customer_id", selectedId);
      if (delErr) throw delErr;
      const resetPatch = {
        event_type: null, guest_count: null, venue: null, event_month: null, event_date: null,
        last_sent_image_titles: [], conversation_summary: null, summary_until_message_id: null,
        last_message_snippet: null, last_message_at: null, unread_count: 0,
      };
      const { error: updErr } = await supabase.from("customers").update(resetPatch).eq("id", selectedId);
      if (updErr) throw updErr;
      setMessages([]);
      updateLocalCustomer(resetPatch);
      toast.success("ล้างประวัติแชท + context AI ของลูกค้านี้แล้ว");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearingChat(false);
    }
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

  const [pausePickerOpen, setPausePickerOpen] = useState(false);

  const toggleAi = async (active: boolean) => {
    if (!selected) return;
    if (!active) { setPausePickerOpen(true); return; }
    const update: any = { ai_active: true, manual_chat_until: null, ai_resumed_at: new Date().toISOString() };
    await supabase.from("customers").update(update).eq("id", selected.id);
    updateLocalCustomer(update);
    toast.success("เปิด AI แล้ว");
  };

  const pauseAiFor = async (hours: number) => {
    if (!selected) return;
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    const update: any = { ai_active: false, manual_chat_until: until };
    await supabase.from("customers").update(update).eq("id", selected.id);
    updateLocalCustomer(update);
    setPausePickerOpen(false);
    toast.success(`ปิด AI ${hours} ชม.`);
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
            <Input placeholder="ค้นหาชื่อ / เบอร์ / UID / ข้อความ" value={search} onChange={e => setSearch(e.target.value)} className="pl-9"/>
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
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {msgSnippets[c.id] ? <span className="text-primary">🔍 {msgSnippets[c.id]}</span> : (c.last_message_snippet || "—")}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] py-0 h-4">{STATUS_LABEL[c.status] || c.status}</Badge>
                  {!c.ai_active && <Badge variant="secondary" className="text-[10px] py-0 h-4">Manual</Badge>}
                  {c.unread_count > 0 && <Badge className="text-[10px] py-0 h-4 ml-auto">{c.unread_count}</Badge>}
                </div>
              </div>
            </button>
          ))}
          {!isSearching && hasMore && !loading && (
            <div ref={sentinelRef} className="p-4 flex justify-center">
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground"/> : <span className="text-[10px] text-muted-foreground">เลื่อนเพื่อโหลดเพิ่ม…</span>}
            </div>
          )}
          {!isSearching && !hasMore && customers.length > 0 && (
            <p className="p-3 text-center text-[10px] text-muted-foreground">— ครบทั้งหมด {customers.length} คน —</p>
          )}
          {isSearching && !loading && (
            <p className="p-3 text-center text-[10px] text-muted-foreground">ผลค้นหา: {filtered.length} คน</p>
          )}
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" title="ล้างประวัติแชทของลูกค้านี้" disabled={clearingChat}>
                    {clearingChat ? <Loader2 className="w-4 h-4 animate-spin"/> : <Eraser className="w-4 h-4"/>}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ล้างประวัติแชทของลูกค้านี้?</AlertDialogTitle>
                    <AlertDialogDescription>
                      จะลบข้อความทั้งหมดของ <b>{selected.nickname || selected.display_name}</b> และรีเซ็ต context ที่ AI จำไว้ (ประเภทงาน, จำนวนคน, สถานที่, วันจัด, สรุปสนทนา) — ใช้สำหรับเทสต์ใหม่ ลูกค้ารายอื่นจะไม่ถูกกระทบ
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction onClick={clearThisChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">ล้างเลย</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="ghost"><Info className="w-4 h-4"/></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[380px] overflow-y-auto">
                  <CustomerInfoPanel customer={selected} onUpdate={updateCustomer} statusLabels={STATUS_LABEL}/>
                </SheetContent>
              </Sheet>
              <Dialog open={pausePickerOpen} onOpenChange={setPausePickerOpen}>
                <DialogContent className="max-w-xs">
                  <DialogHeader>
                    <DialogTitle>ปิด AI ชั่วคราว</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground -mt-2">เลือกระยะเวลาที่ต้องการให้บอทพัก แล้วบอทจะกลับมาทำงานอัตโนมัติ</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 3, 5, 6].map(h => (
                      <Button key={h} variant="outline" onClick={() => pauseAiFor(h)}>{h} ชม.</Button>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => setPausePickerOpen(false)}>ยกเลิก</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Manual timer */}
            <ManualTimerBanner customer={selected} onUpdate={updateLocalCustomer}/>

            {/* Message search */}
            <div className="border-b bg-muted/40 px-3 py-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
              <Input value={msgSearch} onChange={e=>setMsgSearch(e.target.value)} placeholder="ค้นหาในประวัติแชท (ลูกค้า + AI)…" className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"/>
              {msgSearch && <span className="text-xs text-muted-foreground shrink-0">{messages.filter(m=>(m.message||"").toLowerCase().includes(msgSearch.toLowerCase())).length} ผลลัพธ์</span>}
              {msgSearch && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>setMsgSearch("")}><X className="w-4 h-4"/></Button>}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef as any}>
              <div className="max-w-3xl mx-auto space-y-3">
                {(msgSearch ? messages.filter(m=>(m.message||"").toLowerCase().includes(msgSearch.toLowerCase())) : messages).map(m => <MessageBubble key={m.id} m={m} onImageClick={setPreviewImg} highlight={msgSearch} onTrainAI={(t)=>setTrainText(t)}/>)}
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
                <Button size="icon" variant="ghost" type="button" onClick={() => setShowQuick(s => !s)} title="คำตอบสำเร็จรูป">
                  <MessageSquareText className="w-4 h-4"/>
                </Button>
                <Button size="icon" variant="ghost" type="button" onClick={()=>setReply(p => p ? p + "\n" + QUOTE_FORM_TEMPLATE : QUOTE_FORM_TEMPLATE)} title="แทรกฟอร์มขอข้อมูลใบเสนอราคา">
                  <FileText className="w-4 h-4"/>
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
      <TrainAIDialog text={trainText} onClose={()=>setTrainText(null)}/>
    </div>
  );
}

type ClassifiedItem = {
  type: "rule" | "knowledge";
  content: string;
  title?: string;
  category?: string;
  reasoning?: string;
};

function TrainAIDialog({ text, onClose }: { text: string | null; onClose: ()=>void }) {
  const [feedback, setFeedback] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (text) { setFeedback(""); setItems([]); }
  }, [text]);

  const analyze = async () => {
    const fb = feedback.trim();
    if (!fb || !text) return;
    setAnalyzing(true);
    setItems([]);
    try {
      const combined = `คำตอบเดิมของ AI:\n"""${text}"""\n\nสิ่งที่แอดมินอยากให้ปรับ:\n${fb}`;
      const { data, error } = await supabase.functions.invoke("classify-knowledge", { body: { text: combined } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const arr: ClassifiedItem[] = Array.isArray(data?.items) ? data.items : [];
      if (!arr.length) throw new Error("AI วิเคราะห์ไม่ได้ ลองเขียนใหม่นะคะ");
      setItems(arr);
    } catch (e: any) {
      toast.error(e.message || "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<ClassifiedItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const saveItem = async (idx: number) => {
    const it = items[idx];
    if (!it.content?.trim()) { toast.error("เนื้อหาว่าง"); return; }
    setSavingIdx(idx);
    try {
      if (it.type === "rule") {
        const { data: cfg } = await supabase.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle();
        const existing: string[] = cfg?.strict_rules || [];
        const { error } = await supabase.from("app_settings")
          .update({ strict_rules: [...existing, it.content.trim()] })
          .eq("key", "ai_config");
        if (error) throw error;
        toast.success("✅ บันทึกเป็นกฎ AI แล้ว");
      } else {
        const { error } = await supabase.from("knowledge_base").insert({
          title: (it.title || it.content.slice(0, 40)).trim(),
          content: it.content.trim(),
          category: it.category?.trim() || null,
          status: "active",
        });
        if (error) throw error;
        toast.success("✅ บันทึกเข้าฐานความรู้แล้ว");
        supabase.functions.invoke("rebuild-ai-cache").catch(() => {});
      }
      const next = items.filter((_, i) => i !== idx);
      setItems(next);
      if (next.length === 0) onClose();
    } catch (e: any) {
      toast.error(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <Dialog open={!!text} onOpenChange={(o)=>!o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary"/>ปรับปรุงคำตอบของ AI
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">คำตอบเดิมของ AI</Label>
            <div className="text-sm bg-muted/50 border rounded-md p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {text}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">บอกเหมือนคุยกับเพื่อน ว่าอยากให้ AI ปรับยังไง</Label>
            <Textarea
              rows={3}
              value={feedback}
              onChange={e=>setFeedback(e.target.value)}
              placeholder={`เช่น\n• อย่าพูดว่า "3 รูปแบบ" โดยไม่บอกชื่อ ต้องระบุ บุฟเฟ่ต์/ซุ้ม/โต๊ะจีน\n• ตอบสั้นลงอีก ไม่เกิน 2 ประโยค\n• ค่าส่งกรุงเทพฟรี ต่างจังหวัด 15 บ./กม.`}
              disabled={analyzing}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={analyze} disabled={analyzing || !feedback.trim()}>
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                {analyzing ? "AI กำลังวิเคราะห์…" : "ให้ AI ช่วยจัด"}
              </Button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">AI จัดเป็น {items.length} รายการ — ตรวจ/แก้ก่อนกดบันทึก</p>
              {items.map((it, idx) => (
                <div key={idx} className="border-l-4 rounded p-3 bg-card space-y-2"
                  style={{ borderLeftColor: it.type === "rule" ? "hsl(0 80% 55%)" : "hsl(200 80% 50%)" }}>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded",
                      it.type === "rule" ? "bg-red-500/10 text-red-700" : "bg-blue-500/10 text-blue-700")}>
                      {it.type === "rule" ? "🛡️ กฎ AI (ใช้ทุกครั้ง)" : "📚 ฐานความรู้ (ดึงเมื่อถาม)"}
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                      onClick={()=>updateItem(idx, { type: it.type === "rule" ? "knowledge" : "rule" })}>
                      ย้ายอีกฝั่ง
                    </Button>
                  </div>
                  {it.reasoning && <p className="text-[11px] text-muted-foreground italic">💡 {it.reasoning}</p>}
                  {it.type === "knowledge" && (
                    <Input className="h-8 text-sm" placeholder="หัวข้อ"
                      value={it.title || ""} onChange={e=>updateItem(idx, { title: e.target.value })}/>
                  )}
                  <Textarea rows={3} className="text-sm"
                    value={it.content} onChange={e=>updateItem(idx, { content: e.target.value })}/>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={()=>setItems(prev => prev.filter((_,i)=>i!==idx))}>ทิ้ง</Button>
                    <Button size="sm" onClick={()=>saveItem(idx)} disabled={savingIdx===idx}>
                      {savingIdx===idx && <Loader2 className="w-3.5 h-3.5 animate-spin"/>}บันทึก
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ m, onImageClick, highlight, onTrainAI }: { m: any; onImageClick: (u: string) => void; highlight?: string; onTrainAI?: (t: string) => void }) {
  const isCustomer = m.sender === "customer";
  const isAdmin = m.sender === "admin";
  const align = isCustomer ? "items-start" : "items-end";
  const bg = isCustomer ? "bg-card border" : isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary";
  const label = isCustomer ? "ลูกค้า" : isAdmin ? "👤 แอดมิน" : "🤖 AI";
  const imgUrls = (m.message.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/gi) || []);
  const ocrMatch = m.message.match(/📄\s*เนื้อหาในรูป:\s*\n?([\s\S]*)$/);
  const ocrText = ocrMatch?.[1]?.trim() || "";
  let cleaned = m.message
    .replace(/📄\s*เนื้อหาในรูป:[\s\S]*$/, "")
    .replace(/📎\s*https?:\/\/\S+/g, "")
    .replace(/\[(รูปภาพ|วิดีโอ|ไฟล์|เสียง)\]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  // highlight matching text
  const renderText = (txt: string) => {
    if (!highlight) return txt;
    const idx = txt.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return txt;
    return <>{txt.slice(0, idx)}<mark className="bg-yellow-300/70 rounded px-0.5">{txt.slice(idx, idx + highlight.length)}</mark>{txt.slice(idx + highlight.length)}</>;
  };
  return (
    <div className={cn("flex flex-col gap-1 group", align)}>
      <span className="text-[10px] text-muted-foreground px-2 flex items-center gap-1.5">
        {label}{m.confidence_score != null && ` • ${m.confidence_score}%`}{m.is_fallback && " • fallback"}
        {m.sender === "ai" && cleaned && onTrainAI && (
          <button onClick={()=>onTrainAI(cleaned)} className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="ปรับปรุงคำตอบของ AI ให้ดีขึ้น">
            <Brain className="w-3 h-3"/>ปรับปรุงคำตอบนี้
          </button>
        )}
      </span>
      {imgUrls.length > 0 && (
        <div className={cn(
          "grid gap-1.5 max-w-[320px]",
          imgUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {imgUrls.map((u: string) => (
            <img key={u} src={u} alt="" loading="lazy" onClick={() => onImageClick(u)}
              className="w-full aspect-square object-cover rounded-lg border cursor-pointer hover:opacity-90"/>
          ))}
        </div>
      )}
      {ocrText && (
        <div className="max-w-[80%] rounded-lg border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap break-words text-muted-foreground">
          <div className="flex items-center gap-1 mb-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
            📄 เนื้อหาในรูป (OCR)
          </div>
          {renderText(ocrText)}
        </div>
      )}
      {cleaned && (
        <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words", bg)}>
          {renderText(cleaned)}
        </div>
      )}
      <span className="text-[10px] text-muted-foreground px-2">{new Date(m.created_at).toLocaleString("th-TH")}</span>
    </div>
  );
}

