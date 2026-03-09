import { useState } from "react";
import { Search, Info, Trash2, Loader2, CheckSquare, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function KBItemList({ items, selectedId, onSelect, onDelete }) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const filtered = items.filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} วันที่แล้ว`;
    return `${Math.floor(days / 7)} สัปดาห์`;
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((i) => i.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`ยืนยันลบข้อมูล ${selectedIds.size} รายการ?`)) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await base44.entities.KnowledgeBase.delete(id);
      onDelete(id);
    }
    toast.success(`ลบ ${ids.length} รายการสำเร็จ`);
    setSelectedIds(new Set());
    setDeleting(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="ค้นหาข้อมูล" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <button onClick={selectAll} className="text-xs text-green-600 hover:underline flex items-center gap-1">
            {selectedIds.size === filtered.length
              ? <><CheckSquare className="w-3.5 h-3.5" /> ยกเลิกทั้งหมด</>
              : <><Square className="w-3.5 h-3.5" /> เลือกทั้งหมด</>}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} disabled={deleting}
              className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              ลบ {selectedIds.size} รายการ
            </button>
          )}
        </div>
      )}

      <div className="space-y-1">
        {filtered.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีข้อมูล</div>}
        {filtered.map((item) => (
          <div key={item.id} onClick={() => onSelect(item)}
            className={`w-full flex items-center gap-2 px-3 py-3 rounded-lg text-left transition-colors cursor-pointer ${
              selectedId === item.id ? "bg-green-50 border border-green-200" : "hover:bg-muted/50"
            }`}>
            <button onClick={(e) => toggleSelect(item.id, e)} className="shrink-0 text-muted-foreground hover:text-green-600 transition-colors">
              {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4" />}
            </button>
            <Info className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
              item.status === "active" ? "bg-green-100 text-green-600" : "bg-yellow-100 text-yellow-600"
            }`}>
              {item.status === "active" ? "ใช้งาน" : "ร่าง"}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(item.created_date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}