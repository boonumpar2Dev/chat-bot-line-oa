import { useState, useEffect, useRef } from "react";
import {
  Bot, Send, PowerOff, Search, Loader2, MessageSquareOff,
  Plus, X, Tag, Timer, Paperclip, ChevronLeft,
} from "lucide-react";
import CustomerNameEditor from "@/components/chats/CustomerNameEditor.jsx";
import AutoResponseManager from "@/components/chats/AutoResponseManager.jsx";
import StatusSelector from "@/components/chats/StatusSelector.jsx";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { th } from "date-fns/locale";

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  new: "bg-blue-100 text-blue-700",
  returning: "bg-purple-100 text-purple-700",
  pending_quote: "bg-orange-100 text-orange-700",
  pending_confirm: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL = {
  new: "ลูกค้าใหม่", returning: "ลูกค้าเก่า",
  pending_quote: "รอใบเสนอราคา", pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม", cancelled: "ยกเลิก",
};

// Statuses that force AI off
const AI_OFF_STATUSES = ['pending_quote', 'pending_confirm', 'confirmed'];

const formatTime = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 86400000) return format(d, "HH:mm");
    if (diff < 172800000) return "เมื่อวาน";
    return format(d, "d MMM", { locale: th });
  } catch { return ""; }
};

function getFileType(url = "") {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(l)) return "video";
  if (/\.pdf/.test(l)) return "pdf";
  return null;
}

// ─── Message Content ─────────────────────────────────────────────────────────

function MessageContent({ text }) {
  const parts = text.split("\n");
  return (
    <div className="text-sm whitespace-pre-line leading-relaxed">
      {parts.map((part, i) => {
        const m = part.trim().match(/^📎\s*(https?:\/\/\S+)$/);
        if (m) {
          const url = m[1];
          const type = getFileType(url);
          if (type === "image") {
            return (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="รูปภาพ" className="max-w-[240px] rounded-xl mt-1 cursor-pointer hover:opacity-90 transition-opacity shadow-sm" />
              </a>
            );
          }
          if (type === "video") {
            return <video key={i} src={url} controls className="max-w-[280px] rounded-xl mt-1 shadow-sm" />;
          }
          if (type === "pdf") {
            return (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 mt-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-xs text-red-700 w-fit">
                📄 เปิดไฟล์ PDF
              </a>
            );
          }
          // Other files
          const filename = url.split("/").pop().split("?")[0] || "ไฟล์แนบ";
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 mt-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs text-blue-700 w-fit">
              📎 {filename}
            </a>
          );
        }
        return <span key={i}>{part}{i < parts.length - 1 ? "\n" : ""}</span>;
      })}
    </div>
  );
}

// ─── Cooldown Banner ─────────────────────────────────────────────────────────

function CooldownBanner({ messages, cooldownMinutes }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    const lastAdmin = [...messages].reverse().find(m => m.sender === "admin");
    if (!lastAdmin) { setSecondsLeft(null); return; }
    const end = new Date(lastAdmin.created_date).getTime() + cooldownMinutes * 60000;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [messages, cooldownMinutes]);

  if (!secondsLeft || secondsLeft <= 0) return null;
  const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;

  return (
    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700">
      <Timer className="w-3.5 h-3.5 shrink-0" />
      <span>บอทหยุดตอบชั่วคราว — กลับมาใน <strong>{m > 0 ? `${m} นาที ` : ""}{s} วินาที</strong></span>
    </div>
  );
}

// ─── Tag Manager ─────────────────────────────────────────────────────────────

function TagManager({ customer, onUpdate }) {
  const [newTag, setNewTag] = useState("");
  const [show, setShow] = useState(false);

  const add = async () => {
    const t = newTag.trim();
    if (!t || (customer.tags || []).includes(t)) return;
    const tags = [...(customer.tags || []), t];
    await base44.entities.Customer.update(customer.id, { tags });
    onUpdate({ ...customer, tags });
    setNewTag(""); setShow(false);
  };

  const remove = async (tag) => {
    const tags = (customer.tags || []).filter(t => t !== tag);
    await base44.entities.Customer.update(customer.id, { tags });
    onUpdate({ ...customer, tags });
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {customer.tags?.map(tag => (
        <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-1 group">
          {tag}
          <button onClick={() => remove(tag)} className="opacity-0 group-hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
        </span>
      ))}
      {show ? (
        <div className="flex items-center gap-1">
          <input
            type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()} placeholder="Tag"
            className="w-20 px-1.5 py-0.5 text-[10px] rounded border border-input bg-background focus:outline-none" autoFocus
          />
          <button onClick={add} className="text-green-600"><Plus className="w-3 h-3" /></button>
          <button onClick={() => { setShow(false); setNewTag(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => setShow(true)} className="text-[10px] text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <Tag className="w-2.5 h-2.5" /> เพิ่ม
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Chats() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(1);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  // Track IDs we already added locally to prevent duplicates from subscription
  const sentIds = useRef(new Set());

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: "ai_config" }).then(data => {
      if (data?.[0]) setCooldownMinutes(data[0].cooldown_minutes || 1);
    });
    base44.entities.Customer.list("-updated_date").then(data => {
      setCustomers(data || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedId) {
      base44.entities.Conversation.filter({ customer_id: selectedId }, "created_date")
        .then(data => setMessages(data || []));
    }
  }, [selectedId]);

  // Real-time: only add if NOT already added by us (fix duplicate bug)
  useEffect(() => {
    const unsub = base44.entities.Conversation.subscribe((event) => {
      if (event.type === "create" && event.data?.customer_id === selectedId) {
        const id = event.data.id;
        if (sentIds.current.has(id)) {
          sentIds.current.delete(id);
          return;
        }
        setMessages(prev => prev.find(m => m.id === id) ? prev : [...prev, event.data]);
      }
    });
    return unsub;
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedCustomer = customers.find(c => c.id === selectedId);

  const toggleAI = async () => {
    if (!selectedCustomer) return;
    const next = !selectedCustomer.ai_active;
    await base44.entities.Customer.update(selectedCustomer.id, { ai_active: next });
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ai_active: next } : c));
    toast.success(next ? "เปิด AI สำหรับลูกค้านี้แล้ว" : "ปิด AI สำหรับลูกค้านี้แล้ว");
  };

  const doSend = async (text, messageType = "text", imageUrls = []) => {
    const msg = await base44.entities.Conversation.create({
      customer_id: selectedId,
      message: imageUrls.length > 0
        ? `${text}\n${imageUrls.map(u => `📎 ${u}`).join('\n')}`
        : text,
      sender: "admin",
    });
    sentIds.current.add(msg.id);
    setMessages(prev => [...prev, msg]);

    if (selectedCustomer?.line_user_id) {
      const lineMessages = [{ type: "text", text }];
      for (const imgUrl of imageUrls) {
        lineMessages.push({
          type: "image",
          originalContentUrl: imgUrl,
          previewImageUrl: imgUrl,
        });
      }
      base44.functions.invoke("lineSendMessage", {
        line_user_id: selectedCustomer.line_user_id,
        messages: lineMessages,
      }).catch(() => toast.error("ส่งผ่าน LINE ไม่สำเร็จ"));
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId || sending) return;
    setSending(true);
    const text = newMessage.trim();
    setNewMessage("");
    await doSend(text, "text", []);
    setSending(false);
  };

  const handleUseResponse = async (response) => {
    if (!selectedId || sending) return;
    setSending(true);
    await doSend(response.text, "text", response.image_urls || []);
    setSending(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    e.target.value = "";
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await doSend("", "image", file_url);
    setUploading(false);
  };

  const filteredCustomers = customers.filter(c =>
    !searchQuery || (c.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background flex-col lg:flex-row">

      {/* ── Sidebar (responsive: hidden on mobile unless selected) ────── */}
      <div className={`${!selectedCustomer ? "flex" : "hidden"} lg:flex w-full lg:w-72 shrink-0 flex-col border-b lg:border-r border-border bg-card overflow-y-auto`}>
        <div className="p-4 border-b border-border">
          <h2 className="font-bold text-foreground mb-3 text-base">แชท</h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder="ค้นหาลูกค้า" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {selectedCustomer && (
          <div className="px-4 py-3 border-b border-border shrink-0">
            <AutoResponseManager
              selectedCustomer={selectedCustomer}
              onUseResponse={handleUseResponse}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">ไม่มีลูกค้า</div>
          ) : filteredCustomers.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left border-b border-border/40 ${selectedId === c.id ? "bg-green-50 border-l-2 border-l-green-500" : ""}`}
            >
              <div className="relative shrink-0">
                {c.picture_url
                  ? <img src={c.picture_url} className="w-10 h-10 rounded-full object-cover" alt="" />
                  : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">{(c.display_name || "?").charAt(0)}</div>
                }
                {!c.ai_active && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <PowerOff className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-foreground text-sm truncate">{c.nickname || c.display_name || "ไม่ทราบชื่อ"}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.updated_date)}</span>
                </div>
                <div className="mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status] || "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABEL[c.status] || c.status}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat Area (responsive: full on mobile, flex on desktop) ────── */}
      {!selectedCustomer ? (
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquareOff className="w-14 h-14 mx-auto mb-3 opacity-25" />
            <p className="font-medium">เลือกลูกค้าเพื่อดูแชท</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden w-full lg:flex-1">

          {/* Header */}
          <div className="px-3 lg:px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-3">
            <button
              onClick={() => setSelectedId(null)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="กลับไป"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              {selectedCustomer.picture_url
                ? <img src={selectedCustomer.picture_url} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">{(selectedCustomer.display_name || "?").charAt(0)}</div>
              }
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CustomerNameEditor
                    customer={selectedCustomer}
                    onUpdate={updated => setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))}
                  />
                  {selectedCustomer.line_user_id
                    ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">LINE ✓</span>
                    : <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">ไม่มี LINE</span>
                  }
                  <StatusSelector
                    customer={selectedCustomer}
                    onUpdate={updated => setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))}
                  />
                </div>
                <TagManager
                  customer={selectedCustomer}
                  onUpdate={updated => setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))}
                />
              </div>
            </div>
            <button
              onClick={toggleAI}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${selectedCustomer.ai_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
            >
              {selectedCustomer.ai_active ? <Bot className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
              AI {selectedCustomer.ai_active ? "เปิด" : "ปิด"}
            </button>
          </div>

          <CooldownBanner messages={messages} cooldownMinutes={cooldownMinutes} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ background: "hsl(220 20% 97%)" }}>
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">ยังไม่มีข้อความ</div>
            ) : messages.map(msg => {
              const isCustomer = msg.sender === "customer";
              const isAdmin = msg.sender === "admin";

              return (
                <div key={msg.id} className={`flex gap-2.5 ${isCustomer ? "justify-start" : "justify-end"}`}>
                  {/* Customer avatar */}
                  {isCustomer && (
                    <div className="shrink-0 mt-auto">
                      {selectedCustomer.picture_url
                        ? <img src={selectedCustomer.picture_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                        : <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">{(selectedCustomer.display_name || "?").charAt(0)}</div>
                      }
                    </div>
                  )}

                  <div className={`max-w-[70%] flex flex-col ${isCustomer ? "items-start" : "items-end"}`}>
                    {/* Sender label */}
                    {!isCustomer && (
                      <span className="text-[10px] text-muted-foreground mb-1 px-1">
                        {isAdmin ? "แอดมิน" : "AI Bot"}
                      </span>
                    )}

                    {/* Bubble */}
                    <div
                      className="rounded-2xl px-4 py-2.5 shadow-sm"
                      style={{
                        background: isCustomer ? "#ffffff" : isAdmin ? "#fff3cd" : "hsl(160 84% 42%)",
                        color: isCustomer ? "hsl(222 47% 11%)" : isAdmin ? "hsl(40 30% 20%)" : "#fff",
                        borderTopLeftRadius: isCustomer ? "4px" : undefined,
                        borderTopRightRadius: !isCustomer ? "4px" : undefined,
                        border: isCustomer ? "1px solid hsl(220 13% 90%)" : isAdmin ? "1px solid #fde68a" : "none",
                      }}
                    >
                      <MessageContent text={msg.message} />
                    </div>

                    <span className="text-[10px] text-muted-foreground mt-1 px-1">{formatTime(msg.created_date)}</span>
                  </div>

                  {/* Admin/AI avatar */}
                  {!isCustomer && (
                    <div className="shrink-0 mt-auto">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isAdmin ? "bg-yellow-200" : "bg-green-500"}`}>
                        {isAdmin ? <span className="text-[11px] font-bold text-yellow-800">A</span> : <Bot className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form onSubmit={sendMessage} className="px-3 lg:px-4 py-3 border-t border-border bg-card flex items-center gap-2">
            {/* Image upload */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={handleImageUpload} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 disabled:opacity-40"
              title="แนบไฟล์ (รูปภาพ, วิดีโอ, PDF)"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>

            <input
              type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
              placeholder={selectedCustomer?.line_user_id ? "พิมพ์ข้อความ (ส่งผ่าน LINE)..." : "พิมพ์ข้อความ..."}
              disabled={sending || uploading}
              className="flex-1 px-4 py-2.5 rounded-full border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim() || uploading}
              className="h-10 px-5 rounded-full font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-40 bg-green-600 text-white hover:bg-green-700 shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /><span>ส่ง</span></>}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}