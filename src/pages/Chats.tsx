import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
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
import { Loader2, Send, Search, Phone, MapPin, Users as UsersIcon, Calendar, Info, ArrowLeft, Tag, X, Copy, ExternalLink, Smartphone, Paperclip, MessageSquareText, Brain, FileText, Eraser, Sparkles, BookmarkCheck, History, Download, Film, MoreVertical, Smile, Reply, CornerUpLeft, BookPlus, Image as ImageIcon } from "lucide-react";
import { TeachToKbDialog, type TeachCtx } from "@/components/chats/TeachToKbDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import StatusSelector from "@/components/chats/StatusSelector";
import { STICKER_PACK_ID, STICKER_IDS, stickerPreviewUrl } from "@/lib/line-stickers";
import ManualTimerBanner from "@/components/chats/ManualTimerBanner";
import StagedMessageBar from "@/components/chats/StagedMessageBar";
import QuickResponsePopup from "@/components/chats/QuickResponsePopup";
import ImagePreviewModal from "@/components/chats/ImagePreviewModal";
import LocationPreview, { extractLocation } from "@/components/chats/LocationPreview";
import CustomerInfoPanel from "@/components/customers/CustomerInfoPanel";
import { formatSnippet } from "@/lib/snippet";
import { readNotificationSettings, playNotificationSound } from "@/hooks/useNotificationSound";


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
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า", pending_quote: "รอเสนอราคา", pending_confirm: "รอคอนเฟิร์ม", confirmed: "คอนเฟิร์ม", confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)", postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)", cancelled: "ยกเลิก",
};

function getFileType(url = "") {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(l)) return "video";
  return "file";
}

async function uploadToStorage(file: File): Promise<{ url: string; name: string; size: number } | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `chat-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("line-media").upload(path, file, { upsert: false });
  if (error) { toast.error("อัปโหลดไม่สำเร็จ: " + error.message); return null; }
  const url = supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl;
  return { url, name: file.name, size: file.size };
}

function formatBytes(b: number) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function buildFileFlex(url: string, name: string, size: number) {
  const ext = (name.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
  const sizeText = formatBytes(size);
  return {
    type: "flex",
    altText: `📄 ไฟล์: ${name}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "md", paddingAll: "16px",
        contents: [
          {
            type: "box", layout: "horizontal", spacing: "md", alignItems: "center",
            contents: [
              {
                type: "box", layout: "vertical", width: "48px", height: "48px",
                backgroundColor: "#EFF6FF", cornerRadius: "8px", justifyContent: "center", alignItems: "center",
                contents: [{ type: "text", text: ext, size: "xs", weight: "bold", color: "#2563EB", align: "center" }],
              },
              {
                type: "box", layout: "vertical", flex: 1, spacing: "xs",
                contents: [
                  { type: "text", text: name, size: "sm", weight: "bold", color: "#111827", wrap: true, maxLines: 2 },
                  ...(sizeText ? [{ type: "text", text: sizeText, size: "xs", color: "#6B7280" }] : []),
                ],
              },
            ],
          },
          {
            type: "button", style: "primary", color: "#2563EB", height: "sm",
            action: { type: "uri", label: "ดาวน์โหลดไฟล์", uri: url },
          },
        ],
      },
    },
  };
}

type FilterKind = "all" | "unread" | "read" | "manual" | "first_priority" | "awaiting_admin" | `status:${string}`;

const FILTER_PILLS: { key: FilterKind; label: string; countKey?: "unread" | "manual" | "first_priority" | "awaiting_admin" }[] = [
  { key: "unread", label: "🔴 ยังไม่ได้อ่าน", countKey: "unread" },
  { key: "all", label: "ทั้งหมด" },
  { key: "first_priority", label: "🔥 First Priority", countKey: "first_priority" },
  { key: "awaiting_admin", label: "🤖 รอแอดมิน", countKey: "awaiting_admin" },
  { key: "manual", label: "🤖 Manual", countKey: "manual" },
  { key: "read", label: "อ่านแล้ว" },
];

// Badge helpers — derive from customer row
export function getAwaitingAdmin(c: any): boolean {
  return c?.last_sender === "ai" && c?.admin_unseen === true;
}
export function getFirstPriority(c: any): boolean {
  // ต้องมีเบอร์เท่านั้น (admin ที่เปลี่ยน pending_quote แต่ยังไม่มีเบอร์ — AI จะ extract เบอร์ให้ภายหลัง)
  if (!c?.phone) return false;
  if (c?.status === "pending_quote") return true;
  return c?.last_sender === "ai" && c?.admin_unseen === true;
}

function applyFilter(q: any, filter: FilterKind) {
  if (filter === "unread") return q.gt("unread_count", 0);
  if (filter === "read") return q.eq("unread_count", 0);
  if (filter === "manual") return q.eq("ai_active", false);
  if (filter === "awaiting_admin") return q.eq("last_sender", "ai").eq("admin_unseen", true);
  if (filter === "first_priority") return q.not("phone", "is", null).or("status.eq.pending_quote,and(last_sender.eq.ai,admin_unseen.eq.true)");

  if (filter.startsWith("status:")) return q.eq("status", filter.slice(7));
  return q;
}

function matchesFilter(c: any, filter: FilterKind): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return (c.unread_count || 0) > 0;
  if (filter === "read") return (c.unread_count || 0) === 0;
  if (filter === "manual") return c.ai_active === false;
  if (filter === "awaiting_admin") return getAwaitingAdmin(c);
  if (filter === "first_priority") return getFirstPriority(c);
  if (filter.startsWith("status:")) return c.status === filter.slice(7);
  return true;
}

const LAST_CUSTOMER_KEY = "chats:lastCustomer";
const draftKey = (userId: string | undefined, customerId: string) =>
  `chats:draft:${userId || "anon"}:${customerId}`;
type Draft = { text?: string; files?: { url: string; name: string; size: number }[] };
const readDraft = (userId: string | undefined, customerId: string | null): Draft => {
  if (!customerId) return {};
  try {
    const raw = localStorage.getItem(draftKey(userId, customerId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

export default function Chats() {
  const { user } = useAuth();
  const userId = user?.id;
  const [sp, setSp] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const selectedId = sp.get("customer");
  const setSelectedId = (id: string | null) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set("customer", id);
      else next.delete("customer");
      return next;
    }, { replace: true });
    try {
      if (id) sessionStorage.setItem(LAST_CUSTOMER_KEY, id);
      else sessionStorage.removeItem(LAST_CUSTOMER_KEY);
    } catch {}
  };

  // Restore last opened customer on mount if URL has no ?customer=
  useEffect(() => {
    if (sp.get("customer")) return;
    try {
      const last = sessionStorage.getItem(LAST_CUSTOMER_KEY);
      if (last) {
        setSp(prev => {
          const next = new URLSearchParams(prev);
          next.set("customer", last);
          return next;
        }, { replace: true });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [filterCounts, setFilterCounts] = useState<{ unread: number; manual: number; first_priority: number; awaiting_admin: number }>({ unread: 0, manual: 0, first_priority: 0, awaiting_admin: 0 });
  const [reply, setReply] = useState<string>(() => readDraft(user?.id, sp.get("customer")).text || "");
  const [stagedFiles, setStagedFiles] = useState<{ url: string; name: string; size: number }[]>(() => readDraft(user?.id, sp.get("customer")).files || []);
  const [stagedSticker, setStagedSticker] = useState<{ packageId: string; stickerId: string } | null>(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState<{ id: string; quoteToken: string; sender: string; snippet: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [msgSearch, setMsgSearch] = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [trainCtx, setTrainCtx] = useState<{ text: string; customerId: string } | null>(null);
  const [teachKbCtx, setTeachKbCtx] = useState<TeachCtx | null>(null);
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

  // Initial load + reload when search/filter changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(0);
    setHasMore(true);
    (async () => {
      let q: any = supabase.from("customers").select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (isSearching) {
        const s = debouncedSearch.replace(/[%,]/g, "");
        q = q.or(`display_name.ilike.%${s}%,nickname.ilike.%${s}%,phone.ilike.%${s}%,line_user_id.ilike.%${s}%`).limit(100);
      } else {
        q = applyFilter(q, filter).range(0, PAGE_SIZE - 1);
      }
      const { data } = await q;
      if (!active) return;
      setCustomers(data || []);
      setHasMore(!isSearching && (data?.length || 0) === PAGE_SIZE);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [debouncedSearch, isSearching, filter]);

  // Fetch counts for filter pills
  const refreshCounts = async () => {
    const base = () => supabase.from("customers").select("*", { count: "exact", head: true });
    const [u, m, fp, aa] = await Promise.all([
      base().gt("unread_count", 0),
      base().eq("ai_active", false),
      base().not("phone", "is", null).or("status.eq.pending_quote,and(last_sender.eq.ai,admin_unseen.eq.true)"),
      base().eq("last_sender", "ai").eq("admin_unseen", true),
    ]);
    setFilterCounts({ unread: u.count || 0, manual: m.count || 0, first_priority: fp.count || 0, awaiting_admin: aa.count || 0 });
  };
  useEffect(() => { refreshCounts(); }, []);

  // Polling fallback + refocus → keep filter counts fresh even if realtime drops
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshCounts();
    }, 20000);
    const onFocus = () => refreshCounts();
    const onVisible = () => { if (document.visibilityState === "visible") refreshCounts(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Ensure deep-linked customer (?customer=id) row is loaded into list
  useEffect(() => {
    if (!selectedId) return;
    if (customers.some(c => c.id === selectedId)) return;
    (async () => {
      const { data } = await supabase.from("customers").select("*").eq("id", selectedId).maybeSingle();
      if (data) setCustomers(prev => prev.some(c => c.id === data.id) ? prev : [data, ...prev]);
    })();
  }, [selectedId, customers.length]);

  // Realtime: patch in place + drop rows that no longer match active filter
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
        // Refresh counts (debounced via microtask is overkill; cheap enough)
        refreshCounts();
        setCustomers(prev => {
          const idx = prev.findIndex(c => c.id === newRow.id);
          const merged = idx >= 0 ? { ...prev[idx], ...newRow } : newRow;
          const stillMatches = isSearching || matchesFilter(merged, filter);
          if (idx >= 0) {
            if (!stillMatches) return prev.filter(c => c.id !== newRow.id);
            const next = [...prev];
            next[idx] = merged;
            return next.sort((a, b) =>
              new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
            );
          }
          if (payload.eventType === "INSERT" && !isSearching && stillMatches) return [newRow, ...prev];
          return prev;
        });
      })
      // Fallback: listen to NEW conversations so the list updates even if the customers UPDATE event is missed/throttled
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, async (payload: any) => {
        const cid = payload.new?.customer_id;
        if (!cid) return;
        // 🔔 Play sound on incoming customer message (not for AI/admin replies)
        // Skip if currently viewing this customer's chat (already aware)
        if (payload.new?.sender === "customer" && cid !== selectedId) {
          const ns = readNotificationSettings();
          if (ns.enabled) playNotificationSound(ns.sound, ns.volume);
        }
        const { data: fresh } = await supabase.from("customers").select("*").eq("id", cid).maybeSingle();
        if (!fresh) return;
        refreshCounts();
        setCustomers(prev => {
          const idx = prev.findIndex(c => c.id === cid);
          const merged = idx >= 0 ? { ...prev[idx], ...fresh } : fresh;
          const stillMatches = isSearching || matchesFilter(merged, filter);
          if (idx >= 0) {
            if (!stillMatches) return prev.filter(c => c.id !== cid);
            const next = [...prev];
            next[idx] = merged;
            return next.sort((a, b) =>
              new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
            );
          }
          if (!isSearching && stillMatches) return [merged, ...prev];
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isSearching, filter, selectedId]);


  // Infinite scroll
  const loadMore = async () => {
    if (loadingMore || !hasMore || isSearching) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q: any = supabase.from("customers").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    q = applyFilter(q, filter).range(from, to);
    const { data } = await q;
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
    supabase.from("customers").update({ unread_count: 0, admin_seen_at: new Date().toISOString() }).eq("id", selectedId).then();
    const ch = supabase.channel(`conv-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${selectedId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Conversation]))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [selectedId]);

  // Draft persistence: save outgoing typed message + staged files per (userId, customer) in localStorage
  const prevDraftIdRef = useRef<string | null>(null);
  // Use layout effect so draft swap happens before paint → no flash of empty composer
  useLayoutEffect(() => {
    // Save draft of previous customer before switching
    const prev = prevDraftIdRef.current;
    if (prev && prev !== selectedId) {
      try {
        const draft: Draft = { text: reply, files: stagedFiles };
        if ((draft.text && draft.text.length) || (draft.files && draft.files.length)) {
          localStorage.setItem(draftKey(userId, prev), JSON.stringify(draft));
        } else {
          localStorage.removeItem(draftKey(userId, prev));
        }
      } catch {}
    }
    // Load draft for the newly selected customer (only when actually switching)
    if (prev !== selectedId) {
      if (selectedId) {
        const d = readDraft(userId, selectedId);
        setReply(d.text || "");
        setStagedFiles(d.files || []);
      } else {
        setReply(""); setStagedFiles([]);
      }
    }
    prevDraftIdRef.current = selectedId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, userId]);

  // Persist current draft (debounced) so refresh / unmount keeps it
  useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => {
      try {
        if (reply.length || stagedFiles.length) {
          localStorage.setItem(draftKey(userId, selectedId), JSON.stringify({ text: reply, files: stagedFiles }));
        } else {
          localStorage.removeItem(draftKey(userId, selectedId));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [reply, stagedFiles, selectedId, userId]);

  // When auth's userId arrives after first render, re-read draft from the correct key
  // (initial useState may have used "anon" key, missing staged files saved under real userId)
  const userIdLoadedRef = useRef(false);
  useEffect(() => {
    if (!userId || userIdLoadedRef.current) return;
    userIdLoadedRef.current = true;
    if (!selectedId) return;
    const d = readDraft(userId, selectedId);
    if ((d.files && d.files.length) || d.text) {
      if (d.files && d.files.length && stagedFiles.length === 0) setStagedFiles(d.files);
      if (d.text && !reply) setReply(d.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Mobile resilience: when the tab becomes visible again (after Android file picker /
  // app switcher), re-read draft from localStorage and merge any files that aren't
  // already staged. Fixes the case where the WebView lost in-memory React state during
  // the picker round-trip but uploadFiles had already persisted results to storage.
  useEffect(() => {
    if (!selectedId) return;
    const restore = () => {
      try {
        const d = readDraft(userId, selectedId);
        if (d.files && d.files.length) {
          setStagedFiles(prev => {
            const seen = new Set(prev.map(f => f.url));
            const extras = d.files!.filter(f => !seen.has(f.url));
            return extras.length ? [...prev, ...extras] : prev;
          });
        }
        if (d.text) setReply(r => (r ? r : d.text!));
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === "visible") restore(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", restore);
    window.addEventListener("pageshow", restore);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", restore);
      window.removeEventListener("pageshow", restore);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedId]);



  // โหลดชื่อแสดงของแอดมินทุกคน (ใช้แทนคำว่า "แอดมิน" ในบับเบิลข้อความ)
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, email");
      if (!active || !data) return;
      const map: Record<string, string> = {};
      for (const p of data as any[]) {
        map[p.id] = (p.display_name?.trim()) || (p.email?.split("@")[0]) || "แอดมิน";
      }
      setAdminNames(map);
    })();
    return () => { active = false; };
  }, []);


  const lastScrolledIdRef = useRef<string | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const viewport = root?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]") ?? root;
    if (!viewport || messages.length === 0) return;
    const isRoomSwitch = lastScrolledIdRef.current !== selectedId;
    lastScrolledIdRef.current = selectedId;
    const scrollToBottom = (behavior: ScrollBehavior) => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    };
    let timers: ReturnType<typeof setTimeout>[] = [];
    let observer: ResizeObserver | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    requestAnimationFrame(() => {
      scrollToBottom(isRoomSwitch ? "auto" : "smooth");
      if (isRoomSwitch) {
        // ยิงซ้ำตามช่วงเวลาเดิม (กันกรณี layout ขยับเล็กน้อย)
        timers = [50, 150, 350, 700, 1200, 2000].map(ms =>
          setTimeout(() => scrollToBottom("auto"), ms)
        );
        // เพิ่ม: ฟัง resize ของ content (รูป/วิดีโอโหลดเสร็จ → ความสูงเพิ่ม → เลื่อนลงล่างอีก)
        // ทำงานสูงสุด 5 วินาทีหลังเปลี่ยนห้อง แล้วหยุด เพื่อไม่รบกวนการ scroll ของผู้ใช้
        const content = viewport.firstElementChild as HTMLElement | null;
        if (content && typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() => scrollToBottom("auto"));
          observer.observe(content);
          stopTimer = setTimeout(() => {
            observer?.disconnect();
            observer = null;
          }, 5000);
        }
      }
    });
    return () => {
      timers.forEach(clearTimeout);
      if (stopTimer) clearTimeout(stopTimer);
      observer?.disconnect();
    };
  }, [messages, selectedId]);

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
    setCustomers(prev => {
      const idx = prev.findIndex(c => c.id === selectedId);
      if (idx < 0) return prev;
      const merged = { ...prev[idx], ...patch };
      const stillMatches = isSearching || matchesFilter(merged, filter);
      if (!stillMatches) return prev.filter(c => c.id !== selectedId);
      const next = [...prev];
      next[idx] = merged;
      return next.sort((a, b) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
      );
    });
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

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const results = (await Promise.all(files.map(uploadToStorage))).filter(Boolean) as { url: string; name: string; size: number }[];
      if (results.length === 0) {
        toast.error("ไม่สามารถอัปโหลดไฟล์ได้ กรุณาลองใหม่");
        return;
      }
      setStagedFiles(p => {
        const next = [...p, ...results];
        // Persist immediately in case the browser unmounts/reloads (e.g. Android Samsung Internet after picker)
        try {
          if (userId && selectedId) {
            localStorage.setItem(draftKey(userId, selectedId), JSON.stringify({ text: reply, files: next }));
          }
        } catch {}
        return next;
      });
    } finally {
      setUploading(false);
    }
  };
  const handleFilesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Capture files synchronously — some mobile browsers clear e.target.files during await
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) { toast.error("ไม่ได้เลือกไฟล์"); return; }
    const tId = toast.loading(`กำลังอัปโหลด ${picked.length} ไฟล์...`);
    try {
      await uploadFiles(picked);
      toast.success(`แนบไฟล์ ${picked.length} ไฟล์เรียบร้อย`, { id: tId });
    } catch (err: any) {
      toast.error(`อัปโหลดไม่สำเร็จ: ${err?.message || "unknown"}`, { id: tId });
    }
  };
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const onDragEnter = (e: React.DragEvent) => {
    if (!selected) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  };
  const onDragOver = (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (!selected) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) await uploadFiles(files);
  };

  // Global guard: prevent browser from opening dropped file when user misses the drop zone
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types || []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const sendReply = async () => {
    if ((!reply.trim() && stagedFiles.length === 0 && !stagedSticker) || !selected) return;
    setSending(true);
    try {
      const lineMessages: any[] = [];
      for (const f of stagedFiles) {
        const t = getFileType(f.url);
        if (t === "image") {
          lineMessages.push({ type: "image", originalContentUrl: f.url, previewImageUrl: f.url });
        } else if (t === "video") {
          lineMessages.push({ type: "video", originalContentUrl: f.url, previewImageUrl: f.url });
        } else {
          // ถ้า URL ไม่มีนามสกุลไฟล์ (เช่น google maps, เว็บลิงก์ทั่วไป) → ส่งเป็น text link
          let isPlainLink = false;
          try {
            const path = new URL(f.url).pathname.toLowerCase();
            isPlainLink = !/\.[a-z0-9]{2,5}$/.test(path);
          } catch {}
          if (isPlainLink) {
            lineMessages.push({ type: "text", text: f.url });
          } else {
            lineMessages.push(buildFileFlex(f.url, f.name, f.size));
          }
        }
      }
      if (reply.trim()) lineMessages.push({ type: "text", text: reply.trim() });
      if (stagedSticker) lineMessages.push({ type: "sticker", packageId: stagedSticker.packageId, stickerId: stagedSticker.stickerId });

      const { error } = await supabase.functions.invoke("line-send-message", {
        body: {
          line_user_id: selected.line_user_id,
          messages: lineMessages,
          customer_id: selected.id,
          quote_token: replyingTo?.quoteToken || null,
          quoted_message_id: replyingTo?.id || null,
        },
      });
      if (error) throw error;
      setReply("");
      setStagedFiles([]);
      setStagedSticker(null);
      setReplyingTo(null);
      try { localStorage.removeItem(draftKey(userId, selected.id)); } catch {}

    } catch (e: any) {
      toast.error("ส่งข้อความไม่สำเร็จ: " + e.message);
    } finally { setSending(false); }
  };



  const [pausePickerOpen, setPausePickerOpen] = useState(false);

  const toggleAi = async (active: boolean) => {
    if (!selected) return;
    if (!active) { setPausePickerOpen(true); return; }
    // ดึง status ล่าสุดจาก DB ก่อน — กัน race เคส StatusSelector เพิ่งเปลี่ยนแต่ realtime ยังไม่มา
    const { data: fresh } = await supabase.from("customers").select("status").eq("id", selected.id).maybeSingle();
    const liveStatus = fresh?.status ?? selected.status;
    const isProtected = ["confirmed", "confirmed_returning", "postponed"].includes(liveStatus);
    const update: any = { ai_active: true, manual_chat_until: null, ai_resumed_at: new Date().toISOString() };
    if (isProtected) update.admin_bot_override = true;
    const { error } = await supabase.from("customers").update(update).eq("id", selected.id);
    if (error) {
      console.error("[toggleAi] update failed:", error, { id: selected.id, update });
      toast.error("เปิด AI ไม่สำเร็จ: " + error.message);
      return;
    }
    updateLocalCustomer(update);
    toast.success(isProtected ? "เปิด AI + override (ระบบจะไม่ปิดอัตโนมัติ)" : "เปิด AI แล้ว");
  };

  const pauseAiFor = async (hours: number) => {
    if (!selected) return;
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    const update: any = { ai_active: false, manual_chat_until: until };
    const { error } = await supabase.from("customers").update(update).eq("id", selected.id);
    if (error) {
      console.error("[pauseAiFor] update failed:", error, { id: selected.id, update });
      toast.error("ปิด AI ไม่สำเร็จ: " + error.message);
      return;
    }
    updateLocalCustomer(update);
    setPausePickerOpen(false);
    toast.success(`ปิด AI ${hours} ชม.`);
  };

  const pauseAiPermanent = async () => {
    if (!selected) return;
    // ปิดถาวร — ไม่มี timer ให้ปลุก, ล้าง override เพื่อไม่ให้ระบบเปิดให้อัตโนมัติ
    const update: any = { ai_active: false, manual_chat_until: null, admin_bot_override: false };
    const { error } = await supabase.from("customers").update(update).eq("id", selected.id);
    if (error) {
      console.error("[pauseAiPermanent] update failed:", error, { id: selected.id, update });
      toast.error("ปิด AI ไม่สำเร็จ: " + error.message);
      return;
    }
    updateLocalCustomer(update);
    setPausePickerOpen(false);
    toast.success("ปิด AI ถาวร — บอทจะไม่ทำงานจนกว่าแอดมินจะเปิดเอง");
  };


  const updateCustomer = async (patch: any) => {
    if (!selected) return;
    const { error } = await supabase.from("customers").update(patch).eq("id", selected.id);
    if (error) {
      console.error("[updateCustomer] update failed:", error, { id: selected.id, patch });
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    updateLocalCustomer(patch);
    toast.success("บันทึกแล้ว");
  };

  const onSelectQuick = (resp: any) => {
    if (resp.text) setReply(p => p ? p + "\n" + resp.text : resp.text);
    const all: string[] = [...(resp.image_urls || []), ...(resp.file_urls || [])];
    if (all.length) {
      const objs = all.map((u: string) => ({
        url: u,
        name: decodeURIComponent(u.split("/").pop()?.split("?")[0] || "ไฟล์"),
        size: 0,
      }));
      setStagedFiles(p => [...p, ...objs]);
    }
    setShowQuick(false);
  };

  return (
    <div className="h-full flex">
      {/* Customer list */}
      <aside className={cn("w-full lg:w-80 border-r flex flex-col bg-card", selectedId && "hidden lg:flex")}>
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground"/>
            <Input placeholder="ค้นหาชื่อ / เบอร์ / UID / ข้อความ" value={search} onChange={e => setSearch(e.target.value)} className="pl-9"/>
          </div>
          {!isSearching && (
            <div className="flex flex-nowrap gap-1.5 overflow-x-auto -mx-3 px-3 pb-1 scrollbar-thin [&::-webkit-scrollbar]:h-1">
              {FILTER_PILLS.map(p => {
                const active = filter === p.key;
                const count = p.countKey ? filterCounts[p.countKey] : 0;
                return (
                  <button key={p.key} onClick={() => setFilter(p.key)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-full border transition flex items-center gap-1 shrink-0 whitespace-nowrap",
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent border-border"
                    )}>
                    {p.label}
                    {p.countKey && count > 0 && (
                      <span className={cn("text-[10px] px-1 rounded-full leading-tight", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
                    )}
                  </button>
                );
              })}
              <Select value={filter.startsWith("status:") ? filter : "__none"} onValueChange={(v) => v !== "__none" && setFilter(v as FilterKind)}>
                <SelectTrigger className={cn(
                  "h-auto py-1 px-2 text-[11px] rounded-full border w-auto gap-1 shrink-0 whitespace-nowrap",
                  filter.startsWith("status:") ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                )}>
                  <SelectValue placeholder="สถานะ ▾">
                    {filter.startsWith("status:") ? `${STATUS_LABEL[filter.slice(7)] || filter.slice(7)}` : "สถานะ ▾"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={`status:${k}`}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          {loading && <div className="p-6 flex justify-center"><Loader2 className="animate-spin"/></div>}
          {!loading && filtered.length === 0 && <p className="p-6 text-sm text-center text-muted-foreground">ยังไม่มีลูกค้า</p>}
          {filtered.map(c => {
            const isUnread = (c.unread_count || 0) > 0;
            const isFirstPriority = getFirstPriority(c);
            const isAwaitingAdmin = !isFirstPriority && getAwaitingAdmin(c);
            return (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full text-left p-3 flex gap-3 border-b hover:bg-accent/50 transition",
                selectedId === c.id && "bg-accent",
                isUnread && selectedId !== c.id && "bg-primary/[0.03]",
                isFirstPriority && selectedId !== c.id && "bg-[#DC2626]/[0.06]"
              )}>
              <div className="relative shrink-0">
                <Avatar className="w-10 h-10">
                  {c.picture_url && <AvatarImage src={c.picture_url}/>}
                  <AvatarFallback className="bg-brand-gradient text-primary-foreground text-xs">
                    {(c.nickname || c.display_name || "?")[0]}
                  </AvatarFallback>
                </Avatar>
                {isUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-background" aria-label="ยังไม่ได้อ่าน" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className={cn("text-sm truncate", isUnread ? "font-semibold text-foreground" : "font-medium")}>
                    {c.nickname || c.display_name || "ไม่ระบุ"}
                  </p>
                  {c.last_message_at && <span className={cn("text-[10px] shrink-0 ml-auto", isUnread ? "text-destructive font-medium" : "text-muted-foreground")}>
                    {formatDistanceToNow(new Date(c.last_message_at), { locale: th, addSuffix: false })}
                  </span>}
                </div>
                <p className={cn("text-xs mt-0.5 line-clamp-2 leading-snug [overflow-wrap:anywhere]", isUnread ? "text-foreground/80" : "text-muted-foreground")}>
                  {msgSnippets[c.id] ? <span className="text-primary">🔍 {msgSnippets[c.id]}</span> : formatSnippet(c.last_message_snippet)}
                </p>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {isFirstPriority && (
                    <Badge className="text-[10px] py-0 h-4 px-1.5 bg-[#DC2626] text-white hover:bg-[#DC2626] border-0">🔥 First Priority</Badge>
                  )}
                  {isAwaitingAdmin && (
                    <Badge className="text-[10px] py-0 h-4 px-1.5 bg-[#F59E0B] text-white hover:bg-[#F59E0B] border-0">🤖 รอแอดมิน</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] py-0 h-4">{STATUS_LABEL[c.status] || c.status}</Badge>
                  {!c.ai_active && !(c.line_user_id?.startsWith("C") || c.line_user_id?.startsWith("R")) && <Badge variant="secondary" className="text-[10px] py-0 h-4">Manual</Badge>}
                  {(c.line_user_id?.startsWith("C") || c.line_user_id?.startsWith("R")) && <Badge variant="secondary" className="text-[10px] py-0 h-4">กรุ๊ป</Badge>}
                  {isUnread && <Badge variant="destructive" className="text-[10px] py-0 h-4 ml-auto px-1.5 min-w-[20px] justify-center">{c.unread_count}</Badge>}
                </div>
              </div>
            </button>
            );
          })}
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
      <main className={cn("flex-1 flex flex-col bg-background min-w-0 relative", !selectedId && "hidden lg:flex")}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
        {isDragging && selected && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-card px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
              <Paperclip className="w-6 h-6 text-primary"/>
              <span className="text-sm font-medium">วางไฟล์ที่นี่เพื่อแนบ</span>
            </div>
          </div>
        )}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">เลือกลูกค้าจากรายการเพื่อดูแชท</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b bg-card p-2.5 pr-3 sm:p-3 flex items-center gap-2 sm:gap-3">
              <Button size="icon" variant="ghost" className="lg:hidden shrink-0 h-9 w-9" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="w-4 h-4"/>
              </Button>
              <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                {selected.picture_url && <AvatarImage src={selected.picture_url}/>}
                <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                  {(selected.nickname || selected.display_name || "?")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-sm sm:text-base leading-tight">{selected.nickname || selected.display_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusSelector customer={selected} onUpdate={updateLocalCustomer}/>
                  {selected.phone && <span className="text-xs text-muted-foreground hidden sm:inline">{selected.phone}</span>}
                </div>
              </div>
              {!(selected.line_user_id?.startsWith("C") || selected.line_user_id?.startsWith("R")) && (
                <div className="flex items-center gap-1 shrink-0">
                  <Label htmlFor="ai-tog" className="text-xs hidden sm:inline">AI</Label>
                  <Switch id="ai-tog" checked={selected.ai_active} onCheckedChange={toggleAi}/>
                </div>
              )}
              <Button size="icon" variant="ghost" className="hidden sm:inline-flex h-9 w-9" onClick={() => setShowMsgSearch(s => !s)} title="ค้นหาในประวัติแชท">
                <Search className="w-4 h-4"/>
              </Button>
              {/* Desktop: eraser inline */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="hidden sm:inline-flex" title="ล้างประวัติแชทของลูกค้านี้" disabled={clearingChat}>
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
                  <Button size="icon" variant="ghost" className="hidden sm:inline-flex h-9 w-9"><Info className="w-4 h-4"/></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[380px] overflow-y-auto">
                  <CustomerInfoPanel customer={selected} onUpdate={updateCustomer} statusLabels={STATUS_LABEL}/>
                </SheetContent>
              </Sheet>
              {/* Mobile: kebab with destructive action */}
              <AlertDialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="sm:hidden h-9 w-9" title="เพิ่มเติม">
                      <MoreVertical className="w-4 h-4"/>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setShowMsgSearch(s => !s)}>
                      <Search className="w-4 h-4 mr-2"/>ค้นหาในแชท
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
                      <Info className="w-4 h-4 mr-2"/>ข้อมูลลูกค้า
                    </DropdownMenuItem>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                        <Eraser className="w-4 h-4 mr-2"/>ล้างประวัติแชท
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ล้างประวัติแชทของลูกค้านี้?</AlertDialogTitle>
                    <AlertDialogDescription>
                      จะลบข้อความทั้งหมดของ <b>{selected.nickname || selected.display_name}</b> และรีเซ็ต context ที่ AI จำไว้
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction onClick={clearThisChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">ล้างเลย</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                  <Button variant="destructive" className="w-full" onClick={pauseAiPermanent}>
                    ปิดถาวร (จนกว่าจะเปิดเอง)
                  </Button>
                  <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => setPausePickerOpen(false)}>ยกเลิก</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Manual timer (ไม่แสดงในกรุ๊ป/ห้อง) */}
            {!(selected.line_user_id?.startsWith("C") || selected.line_user_id?.startsWith("R")) && (
              <ManualTimerBanner customer={selected} onUpdate={updateLocalCustomer}/>
            )}

            {/* Message search (toggleable) */}
            {showMsgSearch && (
              <div className="border-b bg-muted/40 px-3 py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                <Input autoFocus value={msgSearch} onChange={e=>setMsgSearch(e.target.value)} placeholder="ค้นหาในประวัติแชท (ลูกค้า + AI)…" className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"/>
                {msgSearch && <span className="text-xs text-muted-foreground shrink-0">{messages.filter(m=>(m.message||"").toLowerCase().includes(msgSearch.toLowerCase())).length} ผลลัพธ์</span>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>{ setMsgSearch(""); setShowMsgSearch(false); }}><X className="w-4 h-4"/></Button>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 px-3 sm:px-4 py-4" ref={scrollRef as any}>
              <div className="max-w-3xl mx-auto space-y-3">
                {(() => {
                  const list = msgSearch ? messages.filter(m=>(m.message||"").toLowerCase().includes(msgSearch.toLowerCase())) : messages;
                  const byId: Record<string, any> = {};
                  for (const m of messages) byId[m.id] = m;
                  const dayKey = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
                  const fmtDay = (s: string) => {
                    const d = new Date(s);
                    const today = new Date();
                    const yest = new Date(); yest.setDate(today.getDate() - 1);
                    if (dayKey(s) === dayKey(today.toISOString())) return "วันนี้";
                    if (dayKey(s) === dayKey(yest.toISOString())) return "เมื่อวาน";
                    const sameYear = d.getFullYear() === today.getFullYear();
                    return d.toLocaleDateString("th-TH", sameYear
                      ? { day: "numeric", month: "short", weekday: "short" }
                      : { day: "numeric", month: "short", year: "numeric", weekday: "short" });
                  };
                  return list.map((m, idx) => {
                    // หา customer message ก่อนหน้า admin message นี้ (สำหรับเก็บเป็น Q/A)
                    let prevCustomerMsg: any = null;
                    if (m.sender === "admin") {
                      const fullIdx = messages.findIndex(x => x.id === m.id);
                      for (let i = fullIdx - 1; i >= 0; i--) {
                        if (messages[i].sender === "customer") { prevCustomerMsg = messages[i]; break; }
                      }
                    }
                    const prev = idx > 0 ? list[idx - 1] : null;
                    const showDateSep = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                    return (
                    <React.Fragment key={m.id}>
                    {showDateSep && (
                      <div className="flex justify-center my-4">
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted/70 border border-border/50 rounded-full px-3 py-1">
                          {fmtDay(m.created_at)}
                        </span>
                      </div>
                    )}
                    <MessageBubble m={m} onImageClick={setPreviewImg} highlight={msgSearch} onTrainAI={(t)=>selectedId && setTrainCtx({ text: t, customerId: selectedId })} adminNames={adminNames}
                      customerPicture={selected?.picture_url} customerName={selected?.display_name}
                      quotedMessage={m.quoted_message_id ? byId[m.quoted_message_id] : null}
                      onTeachKb={selectedId ? (adminText) => setTeachKbCtx({
                        customerId: selectedId,
                        customerName: selected?.display_name || selected?.nickname,
                        question: prevCustomerMsg?.message || "",
                        answer: adminText,
                      }) : undefined}
                      onReply={(msg)=>{
                        if (!msg.quote_token) { toast.error("ตอบกลับข้อความนี้ไม่ได้ (รองรับเฉพาะข้อความ/สติกเกอร์)"); return; }
                        setReplyingTo({ id: msg.id, quoteToken: msg.quote_token, sender: msg.sender, snippet: formatSnippet(msg.message) });
                      }}/>
                    </React.Fragment>
                    );
                  });
                })()}
              </div>
            </ScrollArea>

            {/* Staged files */}
            <StagedMessageBar files={stagedFiles.map(f => f.url)}
              onRemoveFile={(u) => setStagedFiles(p => p.filter(x => x.url !== u))}
              onClearAll={() => setStagedFiles([])}/>

            {/* Staged sticker */}
            {stagedSticker && (
              <div className="px-4 py-2 border-b bg-amber-50/60 flex items-center gap-2">
                <div className="relative group shrink-0">
                  <img src={stickerPreviewUrl(stagedSticker.stickerId)} alt="sticker"
                    className="w-14 h-14 object-contain rounded-lg border border-amber-200 bg-white p-1"/>
                  <button onClick={() => setStagedSticker(null)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                    <X className="w-2.5 h-2.5"/>
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground">สติกเกอร์ที่จะส่ง — กดปุ่ม <Send className="inline w-3 h-3"/> เพื่อส่ง</span>
              </div>
            )}

            {/* Replying to preview */}
            {replyingTo && (
              <div className="px-4 py-2 border-b bg-primary/5 flex items-center gap-2">
                <CornerUpLeft className="w-4 h-4 text-primary shrink-0"/>
                <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
                  <div className="text-[10px] text-primary font-medium">
                    ตอบกลับ {replyingTo.sender === "customer" ? "ลูกค้า" : replyingTo.sender === "admin" ? "แอดมิน" : "AI"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{replyingTo.snippet}</div>
                </div>
                <button onClick={()=>setReplyingTo(null)}
                  className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center shrink-0" title="ยกเลิก">
                  <X className="w-3.5 h-3.5"/>
                </button>
              </div>
            )}
            <input id="chat-image-input-mobile" type="file"
              accept="image/*,video/*" multiple
              onChange={handleFilesPick} className="hidden"/>
            <input id="chat-file-input-mobile" type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv" multiple
              onChange={handleFilesPick} className="hidden"/>



            {/* Composer */}
            <div className="border-t bg-card p-3 relative pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <QuickResponsePopup show={showQuick} filter={reply.startsWith("/") ? reply.slice(1) : ""}
                onSelect={onSelectQuick} onClose={() => setShowQuick(false)}/>
              <div className="sm:hidden flex items-center gap-1 px-2 pt-2 pb-1 border-b border-border/30">
                <label htmlFor="chat-image-input-mobile"
                  className="inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent cursor-pointer">
                  <ImageIcon className="w-5 h-5"/>
                </label>
                <label htmlFor="chat-file-input-mobile"
                  className="inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent cursor-pointer">
                  <Paperclip className="w-5 h-5"/>
                </label>
                <Button size="icon" variant="ghost" type="button"
                  onClick={() => setReply(p => p ? p + "\n" + QUOTE_FORM_TEMPLATE : QUOTE_FORM_TEMPLATE)}>
                  <FileText className="w-5 h-5"/>
                </Button>
                <Button size="icon" variant="ghost" type="button"
                  onClick={() => setShowQuick(s => !s)}>
                  <MessageSquareText className="w-5 h-5"/>
                </Button>
              </div>
              <div className="max-w-3xl mx-auto flex gap-2 items-end">
                <input ref={fileInputRef} id="chat-file-input" type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple
                  onChange={handleFilesPick} className="hidden"/>
                {/* Desktop: 3 inline buttons */}
                <Button size="icon" variant="ghost" type="button" className="hidden sm:inline-flex" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="แนบไฟล์">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Paperclip className="w-4 h-4"/>}
                </Button>
                <Button size="icon" variant="ghost" type="button" className="hidden sm:inline-flex" onClick={() => setShowQuick(s => !s)} title="คำตอบสำเร็จรูป">
                  <MessageSquareText className="w-4 h-4"/>
                </Button>
                <Button size="icon" variant="ghost" type="button" className="hidden sm:inline-flex" onClick={()=>setReply(p => p ? p + "\n" + QUOTE_FORM_TEMPLATE : QUOTE_FORM_TEMPLATE)} title="แทรกฟอร์มขอข้อมูลใบเสนอราคา">
                  <FileText className="w-4 h-4"/>
                </Button>

                {/* Sticker picker (มือถือ + เดสก์ท็อป) */}
                <Popover open={stickerPickerOpen} onOpenChange={setStickerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" type="button" className="shrink-0" disabled={sending} title="เลือกสติกเกอร์">
                      <Smile className="w-5 h-5"/>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-72 p-2">
                    <div className="text-[11px] text-muted-foreground mb-2 px-1">เลือกสติกเกอร์ — แล้วกดปุ่มส่ง</div>
                    <div className="grid grid-cols-5 gap-1 max-h-64 overflow-y-auto">
                      {STICKER_IDS.map(sid => (
                        <button key={sid} type="button" disabled={sending}
                          onClick={()=>{ setStagedSticker({ packageId: STICKER_PACK_ID, stickerId: sid }); setStickerPickerOpen(false); }}
                          className="aspect-square rounded-md hover:bg-accent transition-colors p-1 disabled:opacity-50">
                          <img src={stickerPreviewUrl(sid)} alt="sticker" loading="lazy"
                            className="w-full h-full object-contain"/>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  onPaste={e => {
                    const files = Array.from(e.clipboardData?.files || []);
                    if (files.length) { e.preventDefault(); uploadFiles(files); }
                  }}
                  placeholder="พิมพ์ข้อความ… (Enter ส่ง)" rows={2}
                  className="resize-none flex-1 min-w-0 rounded-2xl bg-muted/40 border-muted-foreground/15 focus-visible:ring-1 focus-visible:ring-muted-foreground/30 focus-visible:border-muted-foreground/30 focus-visible:ring-offset-0"/>
                <Button size="icon" onClick={sendReply} disabled={sending || (!reply.trim() && stagedFiles.length === 0 && !stagedSticker)} className="shrink-0 rounded-full">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                </Button>
              </div>

              {!(selected.line_user_id?.startsWith("C") || selected.line_user_id?.startsWith("R")) && (
                <p className="text-[10px] text-muted-foreground mt-1 text-center hidden sm:block">การส่งข้อความจะปิด AI ชั่วคราว (Manual Chat)</p>
              )}
            </div>
          </>
        )}
      </main>

      <ImagePreviewModal url={previewImg} onClose={() => setPreviewImg(null)}/>
      <TrainAIDialog ctx={trainCtx} onClose={()=>setTrainCtx(null)}/>
      <TeachToKbDialog ctx={teachKbCtx} onClose={()=>setTeachKbCtx(null)}/>
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

const TrainAIDialog = React.memo(function TrainAIDialog({ ctx, onClose }: { ctx: { text: string; customerId: string } | null; onClose: ()=>void }) {
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<string>("");
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const runAnalyze = async (extraFeedback?: string) => {
    if (!ctx) return;
    setAnalyzing(true);
    setItems([]);
    setDiagnosis("");
    try {
      const { data, error } = await supabase.functions.invoke("teach-from-chat", {
        body: {
          customer_id: ctx.customerId,
          focus_reply: ctx.text,
          feedback: extraFeedback || "",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDiagnosis(data?.diagnosis || "");
      const arr: ClassifiedItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(arr);
      if (!arr.length && !data?.diagnosis) toast.info("AI ไม่พบประเด็นที่ต้องปรับ");
    } catch (e: any) {
      toast.error(e.message || "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (ctx) {
      setItems([]);
      setDiagnosis("");
      if (feedbackRef.current) feedbackRef.current.value = "";
      runAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.text, ctx?.customerId]);


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
    <Dialog open={!!ctx} onOpenChange={(o)=>!o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary"/>สอน AI จากเคสนี้
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">AI จะอ่านบทสนทนาทั้งหมดของลูกค้าคนนี้ → วินิจฉัยว่าตอบผิดตรงไหน → เสนอกฎ/ความรู้เพื่อกันไม่ให้พลาดกับลูกค้าคนอื่น</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">คำตอบ AI ที่อยากปรับ</Label>
            <div className="text-sm bg-muted/50 border rounded-md p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {ctx?.text}
            </div>
          </div>

          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="w-4 h-4 animate-spin"/> AI กำลังอ่านบทสนทนาและวินิจฉัย…
            </div>
          )}

          {!analyzing && diagnosis && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-[11px] font-semibold text-amber-700 uppercase mb-1">🔍 วินิจฉัย</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{diagnosis}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">เพิ่มคำแนะนำ (ไม่บังคับ) — บอก AI ว่าอยากให้เน้นเรื่องอะไร</Label>
            <Textarea
              ref={feedbackRef}
              rows={2}
              defaultValue=""
              placeholder={`เช่น "ดูที่ราคาผิด" หรือ "เน้นเรื่องค่าส่ง"`}
              disabled={analyzing}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={()=>runAnalyze(feedbackRef.current?.value || "")} disabled={analyzing}>
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                วิเคราะห์ใหม่
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
});


function MessageBubble({ m, onImageClick, highlight, onTrainAI, onTeachKb, adminNames, onReply, quotedMessage, customerPicture, customerName }: { m: any; onImageClick: (u: string) => void; highlight?: string; onTrainAI?: (t: string) => void; onTeachKb?: (adminText: string) => void; adminNames?: Record<string, string>; onReply?: (m: any) => void; quotedMessage?: any; customerPicture?: string | null; customerName?: string | null }) {
  const isCustomer = m.sender === "customer";
  const isAdmin = m.sender === "admin";
  const align = isCustomer ? "items-start" : "items-end";
  const bg = isCustomer ? "bg-card border" : isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary";
  const adminName = isAdmin ? (m.admin_user_id && adminNames?.[m.admin_user_id]) || "แอดมิน" : "";
  const label = isCustomer ? "ลูกค้า" : isAdmin ? `👤 ${adminName}` : "🤖 AI";

  const stickerUrls = (m.message.match(/https?:\/\/stickershop\.line-scdn\.net\/\S+?\.png/gi) || []);
  const imgUrls = (m.message.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/gi) || [])
    .filter((u: string) => !stickerUrls.includes(u));
  const videoUrls = (m.message.match(/https?:\/\/\S+\.(?:mp4|mov|webm|m4v)/gi) || []);
  const allUrls = (m.message.match(/https?:\/\/\S+/gi) || []).map((u: string) => u.replace(/[)\].,;]+$/, ""));
  const nonMediaUrls = allUrls.filter((u: string) => !imgUrls.includes(u) && !videoUrls.includes(u) && !stickerUrls.includes(u));
  // ไฟล์จริง = URL ที่มีนามสกุลไฟล์ใน pathname (เช่น .pdf .doc .xlsx)
  const hasFileExt = (u: string) => {
    try { return /\.[a-z0-9]{2,5}$/i.test(new URL(u).pathname); } catch { return false; }
  };
  const fileUrls = nonMediaUrls.filter(hasFileExt);
  const plainLinkUrls = nonMediaUrls.filter((u: string) => !hasFileExt(u));
  const fileLabelMatch = m.message.match(/\[ไฟล์(?::\s*([^\]]+))?\]/);
  const fileLabel = fileLabelMatch?.[1]?.trim() || "";
  const ocrMatch = m.message.match(/📄\s*เนื้อหาในรูป:\s*\n?([\s\S]*)$/);
  const ocrText = ocrMatch?.[1]?.trim() || "";
  const location = extractLocation(m.message);
  let cleaned = m.message
    .replace(/📄\s*เนื้อหาในรูป:[\s\S]*$/, "")
    .replace(/📎\s*https?:\/\/\S+/g, "")
    .replace(/🎭\s*https?:\/\/\S+/g, "")
    .replace(/\[ตำแหน่ง\][\s\S]*?(?=\n\n|$)/g, "")
    .replace(/📍\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, "")
    .replace(/🗺️\s*https?:\/\/\S+/g, "");
  // strip เฉพาะ URL ที่เป็นรูป/วิดีโอ/ไฟล์/สติกเกอร์ — คง plain link ไว้ใน text bubble
  [...imgUrls, ...videoUrls, ...fileUrls, ...stickerUrls].forEach((u: string) => {
    cleaned = cleaned.split(u).join("");
  });
  cleaned = cleaned
    .replace(/\[(รูปภาพ|วิดีโอ|ไฟล์|เสียง|สติกเกอร์)(?::[^\]]*)?\]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  // render: auto-link URLs + highlight matching text
  const renderText = (txt: string) => {
    const urlRe = /(https?:\/\/[^\s]+)/g;
    const parts: (string | JSX.Element)[] = [];
    let last = 0;
    let i = 0;
    txt.replace(urlRe, (url, _g, offset: number) => {
      if (offset > last) parts.push(txt.slice(last, offset));
      const clean = url.replace(/[)\].,;]+$/, "");
      const trailing = url.slice(clean.length);
      parts.push(
        <a key={`u${i++}`} href={clean} target="_blank" rel="noreferrer"
          className="underline underline-offset-2 break-all hover:opacity-80"
          onClick={(e) => e.stopPropagation()}>{clean}</a>
      );
      if (trailing) parts.push(trailing);
      last = offset + url.length;
      return url;
    });
    if (last < txt.length) parts.push(txt.slice(last));
    const nodes = parts.length ? parts : [txt];
    if (!highlight) return <>{nodes}</>;
    const hl = highlight.toLowerCase();
    return <>{nodes.map((n, k) => {
      if (typeof n !== "string") return <span key={k}>{n}</span>;
      const idx = n.toLowerCase().indexOf(hl);
      if (idx < 0) return <span key={k}>{n}</span>;
      return <span key={k}>{n.slice(0, idx)}<mark className="bg-yellow-300/70 rounded px-0.5">{n.slice(idx, idx + highlight.length)}</mark>{n.slice(idx + highlight.length)}</span>;
    })}</>;
  };
  const d = new Date(m.created_at);
  const timeShort = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const fullTime = d.toLocaleString("th-TH");
  const showLabel = !isCustomer; // hide "ลูกค้า" label — left-align is enough
  const canReply = !!m.quote_token && !!onReply;
  const quotedSenderLabel = quotedMessage
    ? (quotedMessage.sender === "customer" ? "ลูกค้า" : quotedMessage.sender === "admin" ? "แอดมิน" : "AI")
    : "";
  const quotedSnippet = quotedMessage ? formatSnippet(quotedMessage.message) : "";
  const initial = (customerName || "?").trim().charAt(0).toUpperCase();
  const bubble = (
    <div className={cn("flex flex-col gap-0.5 group min-w-0 flex-1", align)}>

      {showLabel && (
        <span className="text-[10px] text-muted-foreground px-2 flex items-center gap-1.5">
          {label}{m.confidence_score != null && ` • ${m.confidence_score}%`}{m.is_fallback && " • fallback"}
          {m.sender === "ai" && cleaned && onTrainAI && (
            <button onClick={()=>onTrainAI(cleaned)} className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="ให้ AI วิเคราะห์ทั้งบทสนทนา + เสนอกฎ/ความรู้">
              <Brain className="w-3 h-3"/>สอน AI จากเคสนี้
            </button>
          )}
          {isAdmin && cleaned && onTeachKb && (
            <button onClick={()=>onTeachKb(cleaned)} className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="บันทึกคำตอบนี้เป็นความรู้ AI">
              <BookPlus className="w-3 h-3"/>เพิ่มเป็นความรู้ AI
            </button>
          )}
        </span>
      )}
      {quotedMessage && (
        <div className={cn(
          "max-w-[85%] sm:max-w-[80%] -mb-1 px-3 pt-1.5 pb-3 rounded-t-2xl border-l-2 border-primary bg-muted/50 text-[11px] text-muted-foreground"
        )}>
          <div className="font-medium text-primary mb-0.5">↩ {quotedSenderLabel}</div>
          <div className="truncate">{quotedSnippet}</div>
        </div>
      )}
      {stickerUrls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {stickerUrls.map((u: string) => (
            <img key={u} src={u} alt="sticker" loading="lazy"
              className="w-32 h-32 object-contain"/>
          ))}
        </div>
      )}
      {imgUrls.length > 0 && (
        <div className={cn(
          "grid gap-1.5 max-w-[75vw] sm:max-w-[320px]",
          imgUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {imgUrls.map((u: string) => (
            <img key={u} src={u} alt="" loading="lazy" onClick={() => onImageClick(u)}
              className="w-full aspect-square object-cover rounded-lg border cursor-pointer hover:opacity-90"/>
          ))}
        </div>
      )}
      {location && (
        <LocationPreview lat={location.lat} lng={location.lng} title={location.title} address={location.address} url={location.url} />
      )}
      {videoUrls.length > 0 && (
        <div className="flex flex-col gap-1.5 max-w-[75vw] sm:max-w-[320px]">
          {videoUrls.map((u: string) => (
            <video key={u} src={u} controls className="w-full rounded-lg border bg-black"/>
          ))}
        </div>
      )}
      {fileUrls.length > 0 && (
        <div className="flex flex-col gap-1.5 max-w-[75vw] sm:max-w-[320px]">
          {fileUrls.map((u: string) => {
            const name = fileLabel || decodeURIComponent(u.split("/").pop()?.split("?")[0] || "ไฟล์");
            return (
              <a key={u} href={u} target="_blank" rel="noreferrer" download
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-card hover:bg-accent transition group">
                <div className="w-9 h-9 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate text-foreground">{name}</div>
                  <div className="text-[10px] text-muted-foreground">คลิกเพื่อเปิด / ดาวน์โหลด</div>
                </div>
                <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0"/>
              </a>
            );
          })}
        </div>
      )}
      {cleaned && (
        <div className={cn(
          "max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
          isCustomer && "rounded-tl-md",
          (isAdmin || !isCustomer) && "rounded-tr-md",
          bg
        )} title={fullTime}>
          {renderText(cleaned)}
        </div>
      )}
      <div className={cn("flex items-center gap-1.5 px-2", isCustomer ? "flex-row" : "flex-row-reverse")}>
        <span className="text-[10px] text-muted-foreground/70" title={fullTime}>{timeShort}</span>
        {canReply && (
          <button onClick={()=>onReply!(m)} title="ตอบกลับข้อความนี้"
            className="text-[10px] text-primary hover:underline flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
            <Reply className="w-3 h-3"/>ตอบกลับ
          </button>
        )}
      </div>
    </div>
  );
  if (!isCustomer) return bubble;
  return (
    <div className="flex items-start gap-2">
      <Avatar className="w-8 h-8 shrink-0 mt-0.5">
        {customerPicture && <AvatarImage src={customerPicture}/>}
        <AvatarFallback className="bg-brand-gradient text-primary-foreground text-[10px]">{initial}</AvatarFallback>
      </Avatar>
      {bubble}
    </div>
  );
}


