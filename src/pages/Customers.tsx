import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, Phone, MessageSquare, Users as UsersIcon, Calendar, Tag as TagIcon, X, Plus, Minus, Settings2, Crown, GripVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


const STATUS_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า", pending_quote: "รอเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม", confirmed: "คอนเฟิร์ม", cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  inquiry: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  returning: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  pending_quote: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  pending_confirm: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

type TierDef = { name: string; color: string };
const DEFAULT_TIERS: TierDef[] = [
  { name: "VIP", color: "#f59e0b" },
  { name: "ลูกค้าทั่วไป", color: "#94a3b8" },
];

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

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [masterTags, setMasterTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState<null | "add" | "remove">(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Tier (manual, admin-managed)
  const [tierList, setTierList] = useState<TierDef[]>(DEFAULT_TIERS);
  const [tierMgrOpen, setTierMgrOpen] = useState(false);
  const tierByName = useMemo(() => Object.fromEntries(tierList.map(t => [t.name, t])), [tierList]);

  useEffect(() => {
    supabase.from("app_settings").select("tier_list").eq("key", "ai_config").maybeSingle()
      .then(({ data }: any) => {
        const list = Array.isArray(data?.tier_list) ? data.tier_list : null;
        if (list && list.length) setTierList(list);
      });
  }, []);

  const saveTierList = async (list: TierDef[]) => {
    setTierList(list);
    const { error } = await supabase.from("app_settings").update({ tier_list: list as any }).eq("key", "ai_config");
    if (error) toast.error(error.message);
  };

  const setCustomerTier = async (id: string, tier: string | null) => {
    const { error } = await supabase.from("customers").update({ tier }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, tier } : c));
  };

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
    setSelected(new Set());
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

  // Load master tags
  useEffect(() => {
    supabase.from("tags").select("id, name, color").order("sort_order").order("name")
      .then(({ data }) => setMasterTags((data as any) || []));
  }, []);

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
    return customers.filter(c => {
      if (tierFilter === "all") return true;
      if (tierFilter === "__none__") return !c.tier;
      return c.tier === tierFilter;
    });
  }, [customers, tierFilter]);

  const tagColor = (name: string) => masterTags.find(m => m.name === name)?.color || "#94a3b8";

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const selectAllVisible = () => setSelected(new Set(filtered.map(c => c.id)));
  const clearSelection = () => setSelected(new Set());

  const bulkApplyTag = async (tagName: string, mode: "add" | "remove") => {
    const ids = Array.from(selected);
    if (!ids.length || !tagName) return;
    setBulkBusy(true);
    try {
      const targets = customers.filter(c => selected.has(c.id));
      const updates = await Promise.all(targets.map(async (c) => {
        const cur: string[] = Array.isArray(c.tags) ? c.tags : [];
        let next: string[];
        if (mode === "add") {
          if (cur.includes(tagName)) return null;
          next = [...cur, tagName];
        } else {
          if (!cur.includes(tagName)) return null;
          next = cur.filter(t => t !== tagName);
        }
        const { error } = await supabase.from("customers").update({ tags: next }).eq("id", c.id);
        if (error) throw error;
        return { id: c.id, next };
      }));
      const applied = updates.filter(Boolean) as { id: string; next: string[] }[];
      if (applied.length) {
        setCustomers(prev => prev.map(c => {
          const u = applied.find(a => a.id === c.id);
          return u ? { ...c, tags: u.next } : c;
        }));
      }
      // ensure tag exists in master (idempotent)
      if (mode === "add" && !masterTags.find(m => m.name === tagName)) {
        await supabase.from("tags").insert({ name: tagName, color: "#94a3b8" });
        const { data } = await supabase.from("tags").select("id, name, color").order("sort_order").order("name");
        setMasterTags((data as any) || []);
      }
      toast.success(`${mode === "add" ? "เพิ่ม" : "ลบ"}แท็ก "${tagName}" — กระทบ ${applied.length}/${ids.length} ราย`);
      setTagPickerOpen(null);
    } catch (e: any) {
      toast.error(e?.message || "ทำไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
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

      {/* Bulk action bar (only when selected) */}
      {selected.size > 0 && (
        <div className="border-b bg-primary/5 px-4 lg:px-6 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">เลือก {selected.size} ราย</span>
          <Button size="sm" variant="ghost" onClick={selectAllVisible} className="h-7 text-xs">เลือกทั้งหมดที่แสดง</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="h-7 text-xs">ล้างเลือก</Button>
          <div className="ml-auto flex gap-2">
            <Popover open={tagPickerOpen === "add"} onOpenChange={(o) => setTagPickerOpen(o ? "add" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="default" disabled={bulkBusy} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5"/> เพิ่มแท็ก
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <TagPicker masterTags={masterTags} mode="add" onPick={(name) => bulkApplyTag(name, "add")} />
              </PopoverContent>
            </Popover>
            <Popover open={tagPickerOpen === "remove"} onOpenChange={(o) => setTagPickerOpen(o ? "remove" : null)}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={bulkBusy} className="h-8 gap-1">
                  <Minus className="w-3.5 h-3.5"/> ลบแท็ก
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <TagPicker
                  masterTags={(() => {
                    // เฉพาะแท็กที่มีในกลุ่มที่เลือก
                    const inSel = new Set<string>();
                    customers.filter(c => selected.has(c.id)).forEach(c => (c.tags || []).forEach((t: string) => inSel.add(t)));
                    return masterTags.filter(m => inSel.has(m.name)).concat(
                      Array.from(inSel).filter(t => !masterTags.find(m => m.name === t)).map(t => ({ id: t, name: t, color: "#94a3b8" }))
                    );
                  })()}
                  mode="remove"
                  onPick={(name) => bulkApplyTag(name, "remove")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

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
              const isSelected = selected.has(c.id);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => nav(`/customers/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav(`/customers/${c.id}`); }
                  }}
                  className={cn(
                    "group relative text-left p-4 rounded-xl border bg-card hover:bg-accent/40 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected && "ring-2 ring-primary border-primary/40 bg-primary/5"
                  )}
                >
                  {/* Checkbox — top-left */}
                  <div
                    className="absolute top-3 left-3"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                  >
                    <Checkbox checked={isSelected} className="bg-card" />
                  </div>

                  {/* Open chat — icon button, top-right */}
                  <Button
                    size="icon" variant="ghost"
                    aria-label="เปิดแชท"
                    className="absolute top-2 right-2 h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); nav(`/chats?customer=${c.id}`); }}
                  >
                    <MessageSquare className="w-4 h-4"/>
                  </Button>

                  <div className="flex items-start gap-3 pr-8 pl-7">
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
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {c.tags.slice(0, 5).map((t: string) => (
                            <Badge key={t} className="text-[10px] px-1.5 py-0 h-5 border-0 text-white" style={{ backgroundColor: tagColor(t) }}>
                              {t}
                            </Badge>
                          ))}
                          {c.tags.length > 5 && (
                            <span className="text-[10px] text-muted-foreground">+{c.tags.length - 5}</span>
                          )}
                        </div>
                      )}
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

    </div>
  );
}

function TagPicker({
  masterTags, mode, onPick,
}: { masterTags: { id: string; name: string; color: string }[]; mode: "add" | "remove"; onPick: (name: string) => void }) {
  const [input, setInput] = useState("");
  return (
    <Command>
      <CommandInput placeholder={mode === "add" ? "พิมพ์เพื่อค้นหา/สร้างแท็กใหม่" : "เลือกแท็กที่จะลบ"} value={input} onValueChange={setInput} />
      <CommandList>
        <CommandEmpty>
          {mode === "add" && input.trim() ? (
            <button onClick={() => onPick(input.trim())} className="text-xs text-primary hover:underline px-2 py-1">
              + สร้างและเพิ่มแท็ก "{input.trim()}"
            </button>
          ) : (
            <span className="text-xs text-muted-foreground px-2 py-1">ไม่พบแท็ก</span>
          )}
        </CommandEmpty>
        <CommandGroup>
          {masterTags.map(m => (
            <CommandItem key={m.id} value={m.name} onSelect={() => onPick(m.name)}>
              <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: m.color }} />
              {m.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
