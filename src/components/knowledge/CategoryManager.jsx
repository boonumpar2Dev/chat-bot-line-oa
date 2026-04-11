import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Loader2, FolderOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function CategoryManager({ categories, onRefresh }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some(c => c.name === name)) {
      toast.error("ประเภทนี้มีอยู่แล้ว");
      return;
    }
    setSaving(true);
    await base44.entities.PackageCategory.create({ name, sort_order: categories.length });
    setNewName("");
    setSaving(false);
    toast.success("เพิ่มประเภทสำเร็จ");
    onRefresh();
  };

  const handleUpdate = async (id) => {
    const name = editValue.trim();
    if (!name) return;
    await base44.entities.PackageCategory.update(id, { name });
    setEditingId(null);
    toast.success("แก้ไขสำเร็จ");
    onRefresh();
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    await base44.entities.PackageCategory.delete(id);
    setDeletingId(null);
    toast.success("ลบสำเร็จ");
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">จัดการประเภทแพ็กเกจ</span>
      </div>

      {/* Add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="ชื่อประเภทใหม่ เช่น งานบุญ"
          className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newName.trim()}
          className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          เพิ่ม
        </button>
      </div>

      {/* List */}
      <div className="space-y-1">
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีประเภท กรุณาเพิ่มประเภทแรก</p>
        ) : categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card group">
            {editingId === cat.id ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleUpdate(cat.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none"
                  autoFocus
                />
                <button onClick={() => handleUpdate(cat.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{cat.name}</span>
                <button
                  onClick={() => { setEditingId(cat.id); setEditValue(cat.name); }}
                  className="p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  disabled={deletingId === cat.id}
                  className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {deletingId === cat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}