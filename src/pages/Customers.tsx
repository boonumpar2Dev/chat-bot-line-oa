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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, Search, Phone, MessageSquare, Users as UsersIcon, Calendar, Tag as TagIcon, X, Plus, Settings2, Crown, SlidersHorizontal, List as ListIcon, LayoutGrid, CalendarRange } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


const STATUS_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า", pending_quote: "รอเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม", confirmed: "คอนเฟิร์ม", confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)", completed: "จัดงานจบแล้ว", postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)", cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  inquiry: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  returning: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  pending_quote: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  pending_confirm: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  confirmed_returning: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  completed: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  postponed: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

type TierDef = { name: string; color: string };
const DEFAULT_TIERS: TierDef[] = [
  { name: "VIP", color: "#f59e0b" },
  { name: "ลูกค้าทั่วไป", color: "#94a3b8" },
];

const PAGE_SIZE = 50;

const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const TH_MONTHS_FULL: Record<string,string> = {
  "ม.ค.": "มกราคม","ก.พ.": "กุมภาพันธ์","มี.ค.": "มีนาคม","เม.ย.": "เมษายน",
  "พ.ค.": "พฤษภาคม","มิ.ย.": "มิถุนายน","ก.ค.": "กรกฎาคม","ส.ค.": "สิงหาคม",
  "ก.ย.": "กันยายน","ต.ค.": "ตุลาคม","พ.ย.": "พฤศจิกายน","ธ.ค.": "ธันวาคม",
};
const parseCsv = (s: string | null) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : []);
const toCsv = (arr: string[]) => arr.join(",");

export default function Customers() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const funnelParam = sp.get("funnel");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(sp.get("status") || "all");
  const [tierFilter, setTierFilter] = useState<string>(sp.get("tier") || "all");
  const [tagFilter, setTagFilter] = useState<string>(sp.get("tag") || "");
  const [monthFilter, setMonthFilter] = useState<string[]>(parseCsv(sp.get("months")));
  const [yearFilter, setYearFilter] = useState<string[]>(parseCsv(sp.get("years")));
  const [viewMode, setViewMode] = useState<"list" | "card">((sp.get("view") === "card" ? "card" : "list"));
  const [yearOptions, setYearOptions] = useState<string[]>([]);

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [masterTags, setMasterTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
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
      if (funnelParam) {
        const raw = sessionStorage.getItem("funnel_customer_ids");
        const ids = raw ? (JSON.parse(raw) as string[]) : [];
        if (ids.length > 0) {
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .in("id", ids)
            .order("last_message_at", { ascending: false, nullsFirst: false });
          if (!active) return;
          if (error) { console.error("funnel query error", error); setCustomers([]); }
          else { setCustomers(data || []); }
          setHasMore(false);
          setLoading(false);
          return;
        }
      }
      let q = supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
      if (isSearching) {
        const s = debounced.replace(/[%,]/g, "");
        q = q.or(`display_name.ilike.%${s}%,nickname.ilike.%${s}%,phone.ilike.%${s}%,tax_id.ilike.%${s}%,line_user_id.ilike.%${s}%`).limit(200);
      } else {
        if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
        if (tagFilter) q = q.contains("tags", [tagFilter]);
        if (monthFilter.length) q = q.overlaps("tags", monthFilter);
        // When month filter active, fetch larger page so client-side year/tier filtering has enough rows
        const limit = monthFilter.length ? 500 : PAGE_SIZE;
        q = q.range(0, limit - 1);
      }
      const { data } = await q;
      if (!active) return;
      setCustomers(data || []);
      const pageSize = monthFilter.length ? 500 : PAGE_SIZE;
      setHasMore(!isSearching && (data?.length || 0) === pageSize);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [debounced, isSearching, statusFilter, tagFilter, monthFilter, funnelParam]);

  // Load master tags
  useEffect(() => {
    supabase.from("tags").select("id, name, color").order("sort_order").order("name")
      .then(({ data }) => {
        const list = (data as any) || [];
        setMasterTags(list);
        const years = list
          .map((t: any) => t.name)
          .filter((n: string) => /^25\d{2}$/.test(n))
          .sort((a: string, b: string) => Number(b) - Number(a));
        setYearOptions(years);
      });
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
    if (loadingMore || !hasMore || isSearching || funnelParam) return;
    setLoadingMore(true);
    const np = page + 1;
    const pageSize = monthFilter.length ? 500 : PAGE_SIZE;
    let q = supabase.from("customers").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (tagFilter) q = q.contains("tags", [tagFilter]);
    if (monthFilter.length) q = q.overlaps("tags", monthFilter);
    const { data } = await q.range(np * pageSize, np * pageSize + pageSize - 1);
    setCustomers(p => { const ids = new Set(p.map(c => c.id)); return [...p, ...(data || []).filter((c: any) => !ids.has(c.id))]; });
    setHasMore((data?.length || 0) === pageSize);
    setPage(np); setLoadingMore(false);
  };

  useEffect(() => {
    if (!sentinelRef.current || isSearching || !hasMore || funnelParam) return;
    const obs = new IntersectionObserver(es => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: "200px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [page, hasMore, loadingMore, isSearching, customers.length, statusFilter, funnelParam]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return customers.filter(c => {
      if (tierFilter !== "all") {
        if (tierFilter === "__none__") { if (c.tier) return false; }
        else if (c.tier !== tierFilter) return false;
      }
      if (yearFilter.length) {
        const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
        if (!yearFilter.some(y => tags.includes(y))) return false;
      }
      // When funneled from Reports, DB query fetched by ID only — apply the
      // rest of the filters client-side so users can narrow further.
      if (funnelParam) {
        if (q) {
          const hay = [c.display_name, c.nickname, c.phone, c.tax_id, c.line_user_id]
            .filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
        if (tagFilter && !tags.includes(tagFilter)) return false;
        if (monthFilter.length && !monthFilter.some(m => tags.includes(m))) return false;
      }
      return true;
    });
  }, [customers, tierFilter, yearFilter, funnelParam, debounced, statusFilter, tagFilter, monthFilter]);

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

  const applyTagChanges = async (ids: string[], adds: string[], removes: string[]) => {
    if (!ids.length || (!adds.length && !removes.length)) return;
    setBulkBusy(true);
    try {
      const targets = customers.filter(c => ids.includes(c.id));
      const updates: { id: string; next: string[] }[] = [];
      for (const c of targets) {
        const cur: string[] = Array.isArray(c.tags) ? c.tags : [];
        let next = [...cur];
        for (const a of adds) if (!next.includes(a)) next.push(a);
        if (removes.length) next = next.filter(t => !removes.includes(t));
        if (next.length === cur.length && next.every(t => cur.includes(t))) continue;
        const { error } = await supabase.from("customers").update({ tags: next }).eq("id", c.id);
        if (error) throw error;
        updates.push({ id: c.id, next });
      }
      if (updates.length) {
        setCustomers(prev => prev.map(c => {
          const u = updates.find(a => a.id === c.id);
          return u ? { ...c, tags: u.next } : c;
        }));
      }
      const newTags = adds.filter(a => !masterTags.find(m => m.name === a));
      if (newTags.length) {
        await supabase.from("tags").insert(newTags.map(name => ({ name, color: "#94a3b8" })));
        const { data } = await supabase.from("tags").select("id, name, color").order("sort_order").order("name");
        setMasterTags((data as any) || []);
      }
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
  const updateFilterArr = (k: string, arr: string[]) => {
    const next = new URLSearchParams(sp);
    if (!arr.length) next.delete(k); else next.set(k, toCsv(arr));
    setSp(next, { replace: true });
  };
  const setMonths = (arr: string[]) => { setMonthFilter(arr); updateFilterArr("months", arr); };
  const setYears = (arr: string[]) => { setYearFilter(arr); updateFilterArr("years", arr); };
  const setView = (v: "list" | "card") => {
    setViewMode(v);
    const next = new URLSearchParams(sp);
    if (v === "list") next.delete("view"); else next.set("view", v);
    setSp(next, { replace: true });
  };
  const clearAllFilters = () => {
    setStatusFilter("all"); updateFilter("status", "all");
    setTierFilter("all"); updateFilter("tier", "all");
    setTagFilter(""); updateFilter("tag", "all");
    setMonths([]); setYears([]);
  };
  const activeFilterCount = [statusFilter !== "all", tierFilter !== "all", !!tagFilter, monthFilter.length > 0, yearFilter.length > 0].filter(Boolean).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card/40 backdrop-blur px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <UsersIcon className="w-6 h-6 text-primary" />
              ลูกค้า
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalCount !== null
                ? <>ทั้งหมด {totalCount.toLocaleString()} คน · แสดง {filtered.length.toLocaleString()}</>
                : <>กำลังนับ...</>}
            </p>
          </div>
          <div className="shrink-0 inline-flex rounded-md border bg-background overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={cn("h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium transition", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
              aria-label="มุมมองรายการ"
              title="มุมมองรายการ"
            >
              <ListIcon className="w-4 h-4" /> <span className="hidden sm:inline">รายการ</span>
            </button>
            <button
              onClick={() => setView("card")}
              className={cn("h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium transition border-l", viewMode === "card" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
              aria-label="มุมมองการ์ด"
              title="มุมมองการ์ด"
            >
              <LayoutGrid className="w-4 h-4" /> <span className="hidden sm:inline">การ์ด</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md h-10 flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="ค้นหาชื่อ / เบอร์ / เลขผู้เสียภาษี"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 w-full"
            />
          </div>

          {/* Mobile: collapse 3 filters into a Sheet */}
          <div className="flex gap-2 sm:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="flex-1 justify-start gap-2 relative">
                  <SlidersHorizontal className="w-4 h-4" />
                  ตัวกรอง
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto">
                <SheetHeader className="mb-3">
                  <SheetTitle className="text-base">ตัวกรองลูกค้า</SheetTitle>
                </SheetHeader>
                <div className="space-y-3 pb-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">สถานะ</p>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); updateFilter("status", v); }}>
                      <SelectTrigger className="w-full h-9"><SelectValue placeholder="สถานะ" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกสถานะ</SelectItem>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">ระดับ</p>
                    <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); updateFilter("tier", v); }}>
                      <SelectTrigger className="w-full h-9"><SelectValue placeholder="ระดับ" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกระดับ</SelectItem>
                        {tierList.map(t => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                        <SelectItem value="__none__">ยังไม่กำหนด</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">แท็ก</p>
                    <TagFilterInline
                      value={tagFilter}
                      onChange={(nv) => { setTagFilter(nv); updateFilter("tag", nv || "all"); }}
                      tags={masterTags}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">เดือนจัดงาน <span className="text-[10px] opacity-70">(เลือกได้หลายเดือน)</span></p>
                    <MonthChipPicker value={monthFilter} onChange={setMonths} />
                  </div>
                  {yearOptions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">ปี พ.ศ. <span className="text-[10px] opacity-70">(ไม่จำเป็น)</span></p>
                      <YearChipPicker value={yearFilter} onChange={setYears} options={yearOptions} />
                    </div>
                  )}
                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground h-8" onClick={clearAllFilters}>
                      <X className="w-4 h-4 mr-1" /> ล้างตัวกรองทั้งหมด
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="outline" size="icon" className="shrink-0" title="ตั้งค่าระดับลูกค้า" onClick={() => setTierMgrOpen(true)}>
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Desktop: original layout */}
          <div className="hidden sm:flex flex-wrap gap-2">
            <FilterCombobox
              className="w-44"
              placeholder="สถานะ"
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); updateFilter("status", v); }}
              options={[{ value: "all", label: "ทุกสถานะ" }, ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))]}
            />
            <FilterCombobox
              className="w-40"
              placeholder="ระดับ"
              value={tierFilter}
              onChange={(v) => { setTierFilter(v); updateFilter("tier", v); }}
              options={[
                { value: "all", label: "ทุกระดับ" },
                ...tierList.map(t => ({ value: t.name, label: t.name, color: t.color })),
                { value: "__none__", label: "ยังไม่กำหนด" },
              ]}
            />
            <FilterCombobox
              className="w-44"
              placeholder="แท็ก"
              value={tagFilter || "all"}
              onChange={(v) => { const nv = v === "all" ? "" : v; setTagFilter(nv); updateFilter("tag", nv || "all"); }}
              options={[{ value: "all", label: "ทุกแท็ก" }, ...masterTags.map(t => ({ value: t.name, label: t.name, color: t.color }))]}
            />
            <MultiPickerPopover
              label="เดือนจัดงาน"
              icon={<CalendarRange className="w-4 h-4" />}
              value={monthFilter}
              onChange={setMonths}
              options={TH_MONTHS.map(m => ({ value: m, label: m, sub: TH_MONTHS_FULL[m] }))}
              emptyHint="เลือกเดือนเพื่อตามล่วงหน้า"
            />
            {yearOptions.length > 0 && (
              <MultiPickerPopover
                label="ปี"
                icon={<Calendar className="w-4 h-4" />}
                value={yearFilter}
                onChange={setYears}
                options={yearOptions.map(y => ({ value: y, label: y }))}
              />
            )}
            <Button variant="outline" size="icon" className="shrink-0" title="ตั้งค่าระดับลูกค้า" onClick={() => setTierMgrOpen(true)}>
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {(tagFilter || monthFilter.length > 0 || yearFilter.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground mr-0.5">กรอง:</span>
            {tagFilter && (
              <Badge className="gap-1 pr-1 border-0 text-white" style={{ backgroundColor: "#64748b" }}>
                <TagIcon className="w-3 h-3" /> {tagFilter}
                <button onClick={() => { setTagFilter(""); updateFilter("tag", "all"); }} className="ml-0.5 rounded-full hover:bg-white/20 p-0.5" aria-label="ล้างแท็ก">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {monthFilter.map(m => (
              <Badge key={m} className="gap-1 pr-1 border-0 bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20">
                <CalendarRange className="w-3 h-3" /> {m}
                <button onClick={() => setMonths(monthFilter.filter(x => x !== m))} className="ml-0.5 rounded-full hover:bg-blue-500/20 p-0.5" aria-label={`ลบ ${m}`}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {yearFilter.map(y => (
              <Badge key={y} className="gap-1 pr-1 border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20">
                <Calendar className="w-3 h-3" /> {y}
                <button onClick={() => setYears(yearFilter.filter(x => x !== y))} className="ml-0.5 rounded-full hover:bg-amber-500/20 p-0.5" aria-label={`ลบ ${y}`}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={clearAllFilters}>
              ล้างทั้งหมด
            </Button>
          </div>
        )}
      </div>

      <TierManagerDialog open={tierMgrOpen} onOpenChange={setTierMgrOpen} tierList={tierList} onSave={saveTierList} />

      {/* Bulk action bar (only when selected) */}
      {selected.size > 0 && (
        <div className="border-b bg-primary/5 px-4 lg:px-6 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">เลือก {selected.size} ราย</span>
          <Button size="sm" variant="ghost" onClick={selectAllVisible} className="h-7 text-xs">เลือกทั้งหมดที่แสดง</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="h-7 text-xs">ล้างเลือก</Button>
          <div className="ml-auto">
            <Popover open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="default" disabled={bulkBusy} className="h-8 gap-1">
                  <TagIcon className="w-3.5 h-3.5"/> จัดการแท็ก
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <TagChecklist
                  targets={customers.filter(c => selected.has(c.id))}
                  masterTags={masterTags}
                  busy={bulkBusy}
                  onApply={(adds, removes) => applyTagChanges(Array.from(selected), adds, removes)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {funnelParam && (
        <div className="border-b bg-primary/5 px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {sessionStorage.getItem("funnel_label") || "กรองจาก Dashboard"}
          </span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
            sessionStorage.removeItem("funnel_customer_ids");
            sessionStorage.removeItem("funnel_label");
            nav("/customers");
          }}>
            ล้างตัวกรอง
          </Button>
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
          <div className={cn(
            viewMode === "card"
              ? "p-3 lg:p-4 gap-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              : "px-2 sm:px-4 py-2 max-w-4xl mx-auto divide-y divide-border/60 rounded-lg sm:border sm:bg-card sm:my-3 sm:divide-y"
          )}>
            {viewMode === "list" && filtered.map(c => {
              const tierDef = c.tier ? tierByName[c.tier] : null;
              const isSelected = selected.has(c.id);
              const cleanPhone = c.phone ? String(c.phone).replace(/[^0-9+]/g, "") : "";
              return (
                <div
                  key={c.id}
                  onClick={() => nav(`/customers/${c.id}`)}
                  className={cn(
                    "group flex items-center gap-2 sm:gap-3 px-2 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <div onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }} className="shrink-0">
                    <Checkbox checked={isSelected} />
                  </div>
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={c.picture_url} alt={c.display_name}/>
                    <AvatarFallback className="text-xs">{(c.display_name || "?")[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-medium text-sm truncate">{c.nickname || c.display_name || "ไม่ระบุชื่อ"}</p>
                      {c.tier === "VIP" && <Crown className="w-3 h-3 text-amber-500 shrink-0"/>}
                      {tierDef && c.tier !== "VIP" && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tierDef.color }} title={tierDef.name} />
                      )}
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", STATUS_COLOR[c.status])}>
                        {STATUS_LABEL[c.status] || c.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3"/>{c.phone}</span>
                      ) : (
                        <span className="opacity-50">ไม่มีเบอร์</span>
                      )}
                      {c.event_date && (
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3"/>{new Date(c.event_date).toLocaleDateString("th-TH")}</span>
                      )}
                      {Array.isArray(c.tags) && c.tags
                        .filter((t: string) => TH_MONTHS.includes(t) || /^25\d{2}$/.test(t))
                        .slice(0, 4)
                        .map((t: string) => (
                          <span key={t} className="inline-flex items-center px-1.5 h-4 rounded text-[10px] text-white border-0" style={{ backgroundColor: tagColor(t) }}>{t}</span>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {cleanPhone && (
                      <a
                        href={`tel:${cleanPhone}`}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-emerald-600 hover:bg-emerald-500/10 transition"
                        title="โทร"
                        aria-label="โทร"
                      >
                        <Phone className="w-4 h-4"/>
                      </a>
                    )}
                    <Button
                      size="icon" variant="ghost"
                      aria-label="เปิดแชท"
                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => nav(`/chats?customer=${c.id}`)}
                    >
                      <MessageSquare className="w-4 h-4"/>
                    </Button>
                  </div>
                </div>
              );
            })}
            {viewMode === "card" && filtered.map(c => {
              const tierDef = c.tier ? tierByName[c.tier] : null;
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
                        {c.tier === "VIP" && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0"/>}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex">
                                {tierDef ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-0 text-white cursor-pointer" style={{ backgroundColor: tierDef.color }}>
                                    {tierDef.name}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-dashed text-muted-foreground cursor-pointer">
                                    + ระดับ
                                  </Badge>
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-1" align="start">
                              {tierList.map(t => (
                                <button key={t.name} onClick={() => setCustomerTier(c.id, t.name)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-sm">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                                  {t.name}
                                </button>
                              ))}
                              {c.tier && (
                                <button onClick={() => setCustomerTier(c.id, null)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive text-left text-xs border-t mt-1 pt-2">
                                  <X className="w-3 h-3" /> ลบระดับ
                                </button>
                              )}
                            </PopoverContent>
                          </Popover>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", STATUS_COLOR[c.status])}>
                            {STATUS_LABEL[c.status] || c.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <TagIcon className="w-3 h-3 text-muted-foreground/60 mr-0.5 shrink-0" />
                          {Array.isArray(c.tags) && c.tags.slice(0, 5).map((t: string) => (
                            <Badge key={t} className="text-[10px] px-1.5 py-0 h-5 border-0 text-white" style={{ backgroundColor: tagColor(t) }}>
                              {t}
                            </Badge>
                          ))}
                          {Array.isArray(c.tags) && c.tags.length > 5 && (
                            <span className="text-[10px] text-muted-foreground self-center">+{c.tags.length - 5}</span>
                          )}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 h-5 rounded-md border border-dashed text-muted-foreground hover:bg-accent hover:text-foreground transition">
                                <Plus className="w-2.5 h-2.5"/> แท็ก
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="start">
                              <TagChecklist
                                targets={[c]}
                                masterTags={masterTags}
                                busy={bulkBusy}
                                onApply={(adds, removes) => applyTagChanges([c.id], adds, removes)}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground mt-2 pt-2 border-t border-dashed border-border/60">
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
            <div ref={sentinelRef} className={cn("h-8 flex items-center justify-center text-xs text-muted-foreground", viewMode === "card" && "col-span-full")}>
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin"/>}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function TagChecklist({
  targets, masterTags, busy, onApply,
}: {
  targets: any[];
  masterTags: { id: string; name: string; color: string }[];
  busy: boolean;
  onApply: (adds: string[], removes: string[]) => Promise<void> | void;
}) {
  const [input, setInput] = useState("");

  const total = targets.length;
  const stateOf = (name: string): "all" | "some" | "none" => {
    const n = targets.filter(c => Array.isArray(c.tags) && c.tags.includes(name)).length;
    if (n === 0) return "none";
    if (n === total) return "all";
    return "some";
  };

  const toggle = async (name: string) => {
    const st = stateOf(name);
    if (st === "all") await onApply([], [name]);
    else await onApply([name], []); // add to all (includes "some" → fill rest)
  };

  // Merge master tags with any tag present on targets but missing from master
  const allTags = useMemo(() => {
    const present = new Set<string>();
    targets.forEach(c => (c.tags || []).forEach((t: string) => present.add(t)));
    const extras = Array.from(present)
      .filter(t => !masterTags.find(m => m.name === t))
      .map(t => ({ id: t, name: t, color: "#94a3b8" }));
    return [...masterTags, ...extras];
  }, [masterTags, targets]);

  const q = input.trim().toLowerCase();
  const filtered = q ? allTags.filter(m => m.name.toLowerCase().includes(q)) : allTags;
  const canCreate = !!q && !allTags.find(m => m.name.toLowerCase() === q);

  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder="ค้นหา / สร้างแท็กใหม่" value={input} onValueChange={setInput} />
      <CommandList className="max-h-64">
        {filtered.length === 0 && !canCreate && (
          <CommandEmpty>ไม่พบแท็ก</CommandEmpty>
        )}
        {canCreate && (
          <CommandGroup heading="สร้างใหม่">
            <CommandItem
              value={`__create__${input}`}
              onSelect={() => { toggle(input.trim()); setInput(""); }}
              disabled={busy}
            >
              <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
              <span>สร้างและเพิ่ม "<span className="font-medium">{input.trim()}</span>"</span>
            </CommandItem>
          </CommandGroup>
        )}
        {filtered.length > 0 && (
          <CommandGroup>
            {filtered.map(m => {
              const st = stateOf(m.name);
              return (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => toggle(m.name)}
                  disabled={busy}
                  className="gap-2"
                >
                  <Checkbox
                    checked={st === "all" ? true : st === "some" ? "indeterminate" : false}
                    className="pointer-events-none"
                  />
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="flex-1 truncate">{m.name}</span>
                  {st === "some" && total > 1 && (
                    <span className="text-[10px] text-muted-foreground">บางส่วน</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      {total > 1 && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          กำลังจัดการ {total} ราย · คลิกเพื่อเพิ่ม/ลบกับทุกคน
        </div>
      )}
    </Command>
  );
}

function TierManagerDialog({
  open, onOpenChange, tierList, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; tierList: TierDef[]; onSave: (list: TierDef[]) => void | Promise<void> }) {
  const [draft, setDraft] = useState<TierDef[]>(tierList);
  useEffect(() => { if (open) setDraft(tierList); }, [open, tierList]);

  const update = (i: number, patch: Partial<TierDef>) => setDraft(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  const remove = (i: number) => setDraft(prev => prev.filter((_, idx) => idx !== i));
  const add = () => setDraft(prev => [...prev, { name: "", color: "#94a3b8" }]);

  const save = async () => {
    const clean = draft.map(t => ({ name: t.name.trim(), color: t.color || "#94a3b8" })).filter(t => t.name);
    const seen = new Set<string>();
    const dedup = clean.filter(t => seen.has(t.name) ? false : (seen.add(t.name), true));
    await onSave(dedup);
    toast.success("บันทึกระดับลูกค้าแล้ว");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ตั้งค่าระดับลูกค้า (Tier)</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {draft.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="color" value={t.color} onChange={e => update(i, { color: e.target.value })} className="w-12 h-9 p-1 cursor-pointer" />
              <Input value={t.name} onChange={e => update(i, { name: e.target.value })} placeholder="ชื่อระดับ เช่น VIP, A, Gold" className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-destructive shrink-0"><Trash2Icon /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add} className="w-full gap-1"><Plus className="w-3.5 h-3.5"/> เพิ่มระดับ</Button>
          <p className="text-[11px] text-muted-foreground pt-2">💡 ระดับลูกค้าเป็นแบบกำหนดเอง — แอดมินติดเอง ไม่อัตโนมัติ ใช้ได้กับทุกธุรกิจ (เช่น VIP/ทั่วไป หรือ A/B/C)</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={save}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Trash2Icon() { return <X className="w-4 h-4"/>; }

type FilterOption = { value: string; label: string; color?: string };
function FilterCombobox({ value, onChange, options, placeholder, className }: {
  value: string; onChange: (v: string) => void; options: FilterOption[]; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("justify-between font-normal", className)}>
          <span className="inline-flex items-center gap-2 truncate">
            {current?.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: current.color }} />}
            <span className="truncate">{current?.label || placeholder}</span>
          </span>
          <TagIcon className="w-3.5 h-3.5 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[260px]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
        <Command>
          <CommandInput placeholder="ค้นหา..." />
          <CommandList className="max-h-72">
            <CommandEmpty>ไม่พบ</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem key={o.value} value={o.label} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <span className="inline-flex items-center gap-2">
                    {o.color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: o.color }} />}
                    {o.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagFilterInline({ value, onChange, tags }: { value: string; onChange: (v: string) => void; tags: { name: string; color: string }[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? tags.filter(t => t.name.toLowerCase().includes(s)) : tags;
  }, [q, tags]);
  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาแท็ก..."
        className="h-9"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-1 space-y-0.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent", !value && "bg-accent font-medium")}
        >
          ทุกแท็ก
        </button>
        {filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">ไม่พบ</div>
        ) : filtered.map(t => (
          <button
            key={t.name}
            type="button"
            onClick={() => onChange(t.name)}
            className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent flex items-center gap-2", value === t.name && "bg-accent font-medium")}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthChipPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter(x => x !== m) : [...value, m]);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {TH_MONTHS.map(m => {
        const active = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            className={cn(
              "h-9 rounded-md border text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-border text-foreground"
            )}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

function YearChipPicker({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  const toggle = (y: string) => onChange(value.includes(y) ? value.filter(x => x !== y) : [...value, y]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(y => {
        const active = value.includes(y);
        return (
          <button
            key={y}
            type="button"
            onClick={() => toggle(y)}
            className={cn(
              "h-8 px-2.5 rounded-md border text-xs font-medium transition",
              active
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-background hover:bg-accent border-border text-foreground"
            )}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

function MultiPickerPopover({
  label, icon, value, onChange, options, emptyHint,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string; sub?: string }[];
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between font-normal gap-2 min-w-[160px]">
          <span className="inline-flex items-center gap-2 truncate">
            {icon}
            <span className="truncate">
              {value.length === 0 ? label : `${label} · ${value.length}`}
            </span>
          </span>
          {value.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              aria-label="ล้าง"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onChange([]); } }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {emptyHint && value.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1 pb-2">{emptyHint}</p>
        )}
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {options.map(o => {
            const active = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition",
                  active ? "bg-primary/10 text-foreground" : "hover:bg-accent"
                )}
              >
                <Checkbox checked={active} className="pointer-events-none" />
                <span className="flex-1 truncate">{o.label}</span>
                {o.sub && <span className="text-[10px] text-muted-foreground">{o.sub}</span>}
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t mt-2 pt-2 flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">เลือก {value.length}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>ล้าง</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}




