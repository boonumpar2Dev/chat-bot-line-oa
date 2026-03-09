import { useState, useEffect, useRef } from "react";
import {
  Bot, Send, Power, PowerOff, Search, Loader2,
  MessageSquareOff, Plus, X, Tag, Paperclip, Image, FileText, Film, Timer,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const statusBadge = (status) => {
  switch (status) {
    case "new": return "badge-new";
    case "pending_confirm": return "badge-pending";
    case "confirmed": return "badge-confirmed";
    case "cancelled": return "badge-cancelled";
    default: return "badge-new";
  }
};

const statusLabel = (status) => {
  switch (status) {
    case "new": return "ลูกค้าใหม่";
    case "returning": return "ลูกค้าเก่า";
    case "pending_confirm": return "รอคอนเฟิร์ม";
    case "confirmed": return "คอนเฟิร์ม";
    case "cancelled": return "ยกเลิก";
    default: return status;
  }
};

const formatTime = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return format(d, "HH:mm");
    if (diff < 172800000) return "เมื่อวาน";
    return format(d, "d MMM", { locale: th });
  } catch {
    return "";
  }
};

function getFileTypeFromUrl(url) {
  const lower = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(lower)) return "image";
  if (/\.(mp4|mov|avi|webm|mkv)/.test(lower)) return "video";
  if (/\.pdf/.test(lower)) return "pdf";
  return null;
}

function MessageContent({ message }) {
  const parts = message.split("\n");
  const elements = [];
  parts.forEach((part, i) => {
    const trimmed = part.trim();
    const fileMatch = trimmed.match(/^📎\s*(https?:\/\/\S+)$/);
    if (fileMatch) {
      const url = fileMatch[1];
      const fileType = getFileTypeFromUrl(url);
      if (fileType === "image") {
        elements.push(
          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt="รูปภาพ" className="max-w-[240px] rounded-lg mt-1 cursor-pointer hover:opacity-90 transition-opacity" />
          </a>
        );
      } else if (fileType === "video") {
        elements.push(<video key={i} src={url} controls className="max-w-[280px] rounded-lg mt-1" />);
      } else if (fileType === "pdf") {
        elements.push(
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-1 px-3 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
            <FileText className="w-5 h-5 text-red-500" />
            <span className="text-xs text-foreground underline">เปิดไฟล์ PDF</span>
          </a>
        );
      } else {
        elements.push(<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline block mt-1">📎 {url}</a>);
      }
    } else {
      if (trimmed) elements.push(<span key={i}>{part}{i < parts.length - 1 ? "\n" : ""}</span>);
      else if (i < parts.length - 1) elements.push(<span key={i}>{"\n"}</span>);
    }
  });
  return <div className="text-sm text-foreground whitespace-pre-line">{elements}</div>;
}

function BotStatusBanner({ messages, cooldownMinutes }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    const lastAdmin = [...messages].reverse().find((m) => m.sender === "admin");
    if (!lastAdmin) { setSecondsLeft(null); return; }
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const adminTime = new Date(lastAdmin.created_date).getTime();
    const endTime = adminTime + cooldownMs;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [messages, cooldownMinutes]);

  if (secondsLeft === null || secondsLeft <= 0) return null;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="px-5 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center gap-2 text-xs text-yellow-700">
      <Timer className="w-3.5 h-3.5" />
      <span>บอทหยุดตอบชั่วคราว — จะกลับมาทำงานใน <strong>{mins > 0 ? `${mins} นาที ` : ""}{secs} วินาที</strong></span>
    </div>
  );
}

function CustomerTagManager({ customer, onUpdate }) {
  const [newTag, setNewTag] = useState("");
  const [showInput, setShowInput] = useState(false);

  const addTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    const currentTags = customer.tags || [];
    if (currentTags.includes(tag)) { toast.error("Tag นี้มีอยู่แล้ว"); return; }
    const updatedTags = [...currentTags, tag];
    await base44.entities.Customer.update(customer.id, { tags: updatedTags });
    onUpdate({ ...customer, tags: updatedTags });
    setNewTag(""); setShowInput(false);
  };

  const removeTag = async (tag) => {
    const updatedTags = (customer.tags || []).filter((t) => t !== tag);
    await base44.entities.Customer.update(customer.id, { tags: updatedTags });
    onUpdate({ ...customer, tags: updatedTags });
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`badge-status ${statusBadge(customer.status)}`}>{statusLabel(customer.status)}</span>
      {customer.tags?.map((tag) => (
        <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-1 group">
          {tag}
          <button onClick={() => removeTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button>
        </span>
      ))}
      {showInput ? (
        <div className="flex items-center gap-1">
          <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="ชื่อ Tag" className="w-20 px-1.5 py-0.5 text-[10px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
          <button onClick={addTag} className="text-green-600 hover:opacity-80"><Plus className="w-3 h-3" /></button>
          <button onClick={() => { setShowInput(false); setNewTag(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => setShowInput(true)} className="text-[10px] text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <Tag className="w-2.5 h-2.5" /> เพิ่ม
        </button>
      )}
    </div>
  );
}

export default function Chats() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(1);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await base44.entities.AppSettings.filter({ key: "ai_config" });
      if (data && data.length > 0) setCooldownMinutes(data[0].cooldown_minutes || 1);
    };
    loadSettings();
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const data = await base44.entities.Customer.list("-updated_date");
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId]);

  // Real-time subscription: show new messages instantly (e.g. from LINE webhook)
  useEffect(() => {
    const unsubscribe = base44.entities.Conversation.subscribe((event) => {
      if (event.type === "create" && event.data?.customer_id === selectedId) {
        setMessages((prev) => prev.find(m => m.id === event.data.id) ? prev : [...prev, event.data]);
      }
    });
    return unsubscribe;
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async (customerId) => {
    const data = await base44.entities.Conversation.filter({ customer_id: customerId }, "created_date");
    setMessages(data || []);
  };

  const selectedCustomer = customers.find((c) => c.id === selectedId);

  const toggleAI = async () => {
    if (!selectedCustomer) return;
    await base44.entities.Customer.update(selectedCustomer.id, { ai_active: !selectedCustomer.ai_active });
    setCustomers((prev) => prev.map((c) => c.id === selectedCustomer.id ? { ...c, ai_active: !c.ai_active } : c));
    toast.success(selectedCustomer.ai_active ? "ปิด AI สำหรับลูกค้านี้แล้ว" : "เปิด AI สำหรับลูกค้านี้แล้ว");
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId || sending) return;
    setSending(true);
    const text = newMessage.trim();
    const msg = await base44.entities.Conversation.create({
      customer_id: selectedId,
      message: text,
      sender: "admin",
    });
    setMessages((prev) => [...prev, msg]);
    setNewMessage("");
    // Also push to LINE if customer has a LINE ID
    if (selectedCustomer?.line_user_id) {
      base44.functions.invoke("lineSendMessage", {
        line_user_id: selectedCustomer.line_user_id,
        message: text,
      }).catch(() => toast.error("ส่งผ่าน LINE ไม่สำเร็จ"));
    }
    setSending(false);
  };

  const filteredCustomers = customers.filter((c) =>
    !searchQuery || (c.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-80 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-bold text-foreground mb-3">จัดการแชท</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder="ค้นหาลูกค้า" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">ไม่มีลูกค้า</div>
          ) : (
            filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedId(customer.id)}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 ${selectedId === customer.id ? "bg-green-50 border-l-2 border-l-green-500" : ""}`}
              >
                {customer.picture_url ? (
                  <img src={customer.picture_url} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground">
                    {(customer.display_name || "?").charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm truncate">{customer.display_name || "ไม่ทราบชื่อ"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatTime(customer.updated_date)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`badge-status ${statusBadge(customer.status)} text-[9px]`}>{statusLabel(customer.status)}</span>
                    {!customer.ai_active && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">AI ปิด</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {!selectedCustomer ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquareOff className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">เลือกลูกค้าเพื่อดูแชท</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedCustomer.picture_url ? (
                <img src={selectedCustomer.picture_url} className="w-9 h-9 rounded-full object-cover" alt="" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
                  {(selectedCustomer.display_name || "?").charAt(0)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-foreground text-sm">{selectedCustomer.display_name || "ไม่ทราบชื่อ"}</div>
                  {selectedCustomer.line_user_id
                    ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">LINE ✓</span>
                    : <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">ไม่มี LINE</span>
                  }
                </div>
                <CustomerTagManager
                  customer={selectedCustomer}
                  onUpdate={(updated) => setCustomers((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
                />
              </div>
            </div>
            <button
              onClick={toggleAI}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCustomer.ai_active
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              }`}
            >
              {selectedCustomer.ai_active ? <><Bot className="w-3.5 h-3.5" />AI เปิด</> : <><PowerOff className="w-3.5 h-3.5" />AI ปิด</>}
            </button>
          </div>

          <BotStatusBanner messages={messages} cooldownMinutes={cooldownMinutes} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-10">ยังไม่มีข้อความ</div>
            ) : (
              messages.map((msg) => {
                const isCustomer = msg.sender === "customer";
                const isAdmin = msg.sender === "admin";
                return (
                  <div key={msg.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"} gap-2`}>
                    {isCustomer && (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-auto text-xs">
                        {(selectedCustomer.display_name || "?").charAt(0)}
                      </div>
                    )}
                    <div className={`max-w-[75%] ${isCustomer ? "chat-bubble-user" : isAdmin ? "chat-bubble-admin" : "chat-bubble-ai"}`}>
                      {!isCustomer && (
                        <div className="text-[9px] font-semibold mb-1 opacity-60 uppercase">{isAdmin ? "แอดมิน" : "AI Bot"}</div>
                      )}
                      <MessageContent message={msg.message} />
                      <div className="text-[9px] mt-1 opacity-50 text-right">{formatTime(msg.created_date)}</div>
                    </div>
                    {!isCustomer && (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-auto ${isAdmin ? "bg-yellow-100" : "bg-green-100"}`}>
                        {isAdmin ? <span className="text-xs font-bold text-yellow-700">A</span> : <Bot className="w-3.5 h-3.5 text-green-600" />}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="px-5 py-4 border-t border-border bg-card flex items-center gap-3">
            <input
              type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
              placeholder={selectedCustomer?.line_user_id ? "พิมพ์ข้อความ (จะส่งผ่าน LINE)..." : "พิมพ์ข้อความ..."}
              disabled={sending}
              className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
            <button type="submit" disabled={sending || !newMessage.trim()}
              className="h-10 px-5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-40 bg-green-600 text-white hover:bg-green-700">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /><span>ส่ง</span></>}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}