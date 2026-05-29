import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader2, Search, Phone, MessageSquare, Users as UsersIcon, Calendar, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import CustomerInfoPanel from "@/components/customers/CustomerInfoPanel";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่", returning: "เคยติดต่อ", pending_quote: "รอใบเสนอ",
  pending_confirm: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  returning: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  pending_quote: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  pending_confirm: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
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

const PAGE_SIZE = 50;

export default function Customers() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(sp.get("status") || "all");
  const [tierFilter, setTierFilter] = useState<string>(sp.get("tier") || "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Total count (independent of pagination/filter)
  useEffect(() => {
    let active = true;
    (async () => {
      let q = supabase.from("customers").select("id", { count: "exact", head: true });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const { count } = await q;
      if (active) setTotalCount(count ?? null);
    })();
    return () => { active = false; };
  }, [statusFilter]);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const isSearching = debounced.length >= 2;

  // Load
  useEffect(() => {
    let active = true;
    setLoading(true); setPage(0); setHasMore(true);
    (async () => {
      let q = supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
      if (isSearching) {
        const s = debounced.replace(/[%,]/g, "");
        q = q.or(`display_name.ilike.%${s}%,nickname.ilike.%${s}%,phone.ilike.%${s}%,tax_id.ilike.%${s}%,line_user_id.ilike.%${s}%`).limit(200);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter as any).range(0, PAGE_SIZE - 1);
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
  }, [debounced, isSearching, statusFilter]);

  // Realtime patch
  useEffect(() => {
    const ch = supabase.channel("customers-list-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload: any) => {
        const n: any = payload.new, o: any = payload.old;
        if (payload.eventType === "DELETE") { if (o?.id) setCustomers(p => p.filter(c => c.id !== o.id)); return; }
        if (!n?.id) return;
        setCustomers(p => {
          const i = p.findIndex(c => c.id === n.id);
          if (i >= 0) { const x = [...p]; x[i] = { ...x[i], ...n }; return x; }
          return p;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore || isSearching) return;
    setLoadingMore(true);
    const np = page + 1;
    let q = supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    const { data } = await q.range(np * PAGE_SIZE, np * PAGE_SIZE + PAGE_SIZE - 1);
    setCustomers(p => { const ids = new Set(p.map(c => c.id)); return [...p, ...(data || []).filter((c: any) => !ids.has(c.id))]; });
    setHasMore((data?.length || 0) === PAGE_SIZE);
    setPage(np); setLoadingMore(false);
  };

  useEffect(() => {
    if (!sentinelRef.current || isSearching || !hasMore) return;
    const obs = new IntersectionObserver(es => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: "200px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [page, hasMore, loadingMore, isSearching, customers.length, statusFilter]);

  const filtered = useMemo(() => {
    return customers.filter(c => tierFilter === "all" || tierOf(c) === tierFilter);
  }, [customers, tierFilter]);

  const selected = customers.find(c => c.id === selectedId);

  const updateCustomer = (patch: any) => {
    if (!selectedId) return;
    setCustomers(p => p.map(c => c.id === selectedId ? { ...c, ...patch } : c));
  };

  const updateFilter = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v === "all") next.delete(k); else next.set(k, v);
    setSp(next, { replace: true });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card/40 backdrop-blur px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <UsersIcon className="w-6 h-6 text-primary" />
              ลูกค้า
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalCount !== null
                ? <>ทั้งหมด {totalCount.toLocaleString()} คน · แสดง {customers.length.toLocaleString()}</>
                : <>กำลังนับ...</>}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อ / เบอร์ / เลขผู้เสียภาษี"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); updateFilter("status", v); }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="สถานะ"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); updateFilter("tier", v); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="ระดับ"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกระดับ</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="returning">เคยติดต่อ</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="new">ใหม่</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2"/> กำลังโหลด...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <UsersIcon className="w-10 h-10 mb-2 opacity-50"/>
            <p>ไม่พบลูกค้า</p>
          </div>
        ) : (
          <div className="p-3 lg:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(c => {
              const tier = tierOf(c);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => nav(`/customers/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav(`/customers/${c.id}`); }
                  }}
                  className="group relative text-left p-4 rounded-xl border bg-card hover:bg-accent/40 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Open chat — icon button, top-right */}
                  <Button
                    size="icon" variant="ghost"
                    aria-label="เปิดแชท"
                    className="absolute top-2 right-2 h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); nav(`/chats?customer=${c.id}`); }}
                  >
                    <MessageSquare className="w-4 h-4"/>
                  </Button>

                  <div className="flex items-start gap-3 pr-8">
                    <Avatar className="w-12 h-12 shrink-0">
                      <AvatarImage src={c.picture_url} alt={c.display_name}/>
                      <AvatarFallback>{(c.display_name || "?")[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold truncate">{c.nickname || c.display_name || "ไม่ระบุชื่อ"}</p>
                        {tier === "vip" && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0"/>}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", TIER_COLOR[tier])}>
                          {TIER_LABEL[tier]}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", STATUS_COLOR[c.status])}>
                          {STATUS_LABEL[c.status] || c.status}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {c.phone ? (
                          <div className="flex items-center gap-1.5"><Phone className="w-3 h-3"/> {c.phone}</div>
                        ) : (
                          <div className="flex items-center gap-1.5 opacity-50"><Phone className="w-3 h-3"/> ยังไม่มีเบอร์</div>
                        )}
                        {c.event_date ? (
                          <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3"/> {new Date(c.event_date).toLocaleDateString("th-TH")}</div>
                        ) : (
                          <div className="flex items-center gap-1.5 opacity-50"><Calendar className="w-3 h-3"/> ยังไม่มีข้อมูลงาน</div>
                        )}
                        {c.last_message_at && (
                          <div className="text-[11px] opacity-70">คุยล่าสุด {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: th })}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={sentinelRef} className="col-span-full h-8 flex items-center justify-center text-xs text-muted-foreground">
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin"/>}
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="p-0 w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h2 className="font-semibold">ข้อมูลลูกค้า</h2>
                <Button size="sm" variant="outline" onClick={() => nav(`/chats?customer=${selected.id}`)}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1"/> เปิดแชท
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <CustomerInfoPanel customer={selected} onUpdate={updateCustomer} statusLabels={STATUS_LABEL}/>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
