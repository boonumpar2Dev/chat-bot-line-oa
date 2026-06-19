import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, UserPlus, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string;
  nickname: string | null;
  display_name: string | null;
  phone: string | null;
  status: string | null;
  tags: string[] | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า",
  pending_quote: "รอเสนอราคา", pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม", confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)", completed: "จัดงานจบแล้ว", postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)", cancelled: "ยกเลิก",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tagName: string;
  tagColor: string;
  onDone?: () => void;
}

export default function BulkAssignDialog({ open, onOpenChange, tagName, tagColor, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scope, setScope] = useState<"without" | "all">("without");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch(""); setStatusFilter("all"); setScope("without"); setSelected(new Set());
    load();
  }, [open, tagName]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, nickname, display_name, phone, status, tags")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(2000);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCustomers((data as Customer[]) || []);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const hasTag = (c.tags || []).includes(tagName);
      if (scope === "without" && hasTag) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q) {
        const hay = `${c.nickname || ""} ${c.display_name || ""} ${c.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [customers, search, statusFilter, scope, tagName]);

  const allVisibleIds = filtered.map((c) => c.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) allVisibleIds.forEach((id) => n.delete(id));
      else allVisibleIds.forEach((id) => n.add(id));
      return n;
    });
  };
  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const apply = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("bulk_add_tag", { _tag_name: tagName, _customer_ids: ids });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`ติดแท็ก "${tagName}" ให้ลูกค้า ${data ?? 0} ราย`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" />
            ติดแท็กให้ลูกค้า
            <Badge style={{ backgroundColor: tagColor, color: "#fff" }} className="border-0 ml-1">{tagName}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            เลือกลูกค้าที่ต้องการติดแท็กนี้ — ระบบจะเพิ่มแท็กโดยไม่ลบแท็กเดิมและไม่เพิ่มซ้ำ
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-2.5 bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / เบอร์โทร..."
              className="pl-8 h-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">สถานะทั้งหมด</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="without">เฉพาะที่ยังไม่มีแท็กนี้</SelectItem>
                <SelectItem value="all">แสดงทั้งหมด</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="px-5 py-2 border-b flex items-center justify-between bg-background">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                disabled={filtered.length === 0}
              />
              <span className="text-muted-foreground">
                {loading ? "กำลังโหลด..." : `พบ ${filtered.length} ราย${filtered.length > 0 ? " · เลือกทั้งหมด" : ""}`}
              </span>
            </label>
            {selected.size > 0 && (
              <span className="text-xs font-medium text-primary">เลือก {selected.size} ราย</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin"/> กำลังโหลดลูกค้า...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40"/>
                ไม่พบลูกค้าตามเงื่อนไข
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((c) => {
                  const hasTag = (c.tags || []).includes(tagName);
                  const isSel = selected.has(c.id);
                  const name = c.nickname || c.display_name || "(ไม่มีชื่อ)";
                  return (
                    <li key={c.id}>
                      <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md hover:bg-muted/60 transition-colors ${isSel ? "bg-primary/5" : ""}`}>
                        <Checkbox checked={isSel} onCheckedChange={() => toggle(c.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{name}</span>
                            {c.status && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {STATUS_LABEL[c.status] || c.status}
                              </span>
                            )}
                            {hasTag && (
                              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3"/> มีแท็กนี้แล้ว
                              </span>
                            )}
                          </div>
                          {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between gap-3 bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `จะติดแท็กให้ ${selected.size} ราย` : "ยังไม่ได้เลือกลูกค้า"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
            <Button size="sm" onClick={apply} disabled={busy || selected.size === 0} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <UserPlus className="w-3.5 h-3.5"/>}
              ติดแท็ก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
