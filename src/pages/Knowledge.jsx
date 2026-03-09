import { useState, useEffect } from "react";
import { Plus, FileText, Loader2, ArrowLeft, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KBItemList from "@/components/knowledge/KBItemList.jsx";
import KBEditForm from "@/components/knowledge/KBEditForm.jsx";
import KBChatTest from "@/components/knowledge/KBChatTest.jsx";

export default function Knowledge() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState("list"); // "list" | "edit" | "chat"

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    const data = await base44.entities.KnowledgeBase.list("-created_date");
    setItems(data || []);
    setLoading(false);
  };

  const handleAddNew = async (type) => {
    setAdding(true);
    const title = type === "price" ? "รายการราคาใหม่" : "ข้อมูลใหม่";
    const created = await base44.entities.KnowledgeBase.create({ title, content: "", type, status: "processing" });
    setItems((prev) => [created, ...prev]);
    setSelectedItem(created);
    setAdding(false);
    setView("edit");
  };

  const handleSelect = (item) => {
    setSelectedItem(item);
    setView("edit");
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedItem?.id === id) { setSelectedItem(null); setView("list"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // ── MOBILE layout (< lg) ──────────────────────────────────────────────────
  const MobileView = () => {
    if (view === "edit" && selectedItem) {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => { setView("list"); setSelectedItem(null); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <span className="font-semibold text-foreground">แก้ไขข้อมูล</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <KBEditForm
              key={selectedItem.id}
              item={selectedItem}
              onSaved={() => { fetchItems(); setView("list"); setSelectedItem(null); }}
              onDeleted={() => handleDelete(selectedItem.id)}
              onCancel={() => { setView("list"); setSelectedItem(null); }}
            />
          </div>
        </div>
      );
    }
    if (view === "chat") {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => setView("list")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <span className="font-semibold text-foreground">แชททดสอบ AI</span>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <KBChatTest />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="p-4 border-b border-border bg-card shrink-0">
          <h1 className="text-lg font-bold text-foreground">เพิ่มข้อมูล</h1>
          <p className="text-muted-foreground text-xs mt-0.5">สอนวิธีตอบคำถามของลูกค้าให้ AI</p>
        </div>
        <div className="flex gap-2 px-4 py-3 border-b border-border shrink-0">
          <button onClick={() => handleAddNew("file")} disabled={adding}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition-colors">
            <Plus className="w-4 h-4" /> เพิ่มข้อมูล
          </button>
          <button onClick={() => handleAddNew("price")} disabled={adding}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition-colors">
            <FileText className="w-4 h-4" /> เพิ่มรายการราคา
          </button>
          <button onClick={() => setView("chat")}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            ทดสอบ AI
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <KBItemList items={items} selectedId={selectedItem?.id || null} onSelect={handleSelect} onDelete={handleDelete} />
        </div>
      </div>
    );
  };

  // ── DESKTOP layout (≥ lg) ─────────────────────────────────────────────────
  return (
    <>
      {/* Mobile */}
      <div className="lg:hidden h-screen overflow-hidden">
        <MobileView />
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex flex-col h-screen overflow-hidden p-6 gap-4">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-foreground">เพิ่มข้อมูล</h1>
          <p className="text-muted-foreground text-sm mt-0.5">สอนวิธีตอบคำถามของลูกค้าให้ AI ของคุณ</p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button onClick={() => handleAddNew("file")} disabled={adding}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition-colors">
            <Plus className="w-4 h-4" /> เพิ่มข้อมูล
          </button>
          <button onClick={() => handleAddNew("price")} disabled={adding}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition-colors">
            <FileText className="w-4 h-4" /> เพิ่มรายการราคา
          </button>
        </div>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* List */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="overflow-y-auto flex-1">
              <KBItemList items={items} selectedId={selectedItem?.id || null} onSelect={handleSelect} onDelete={handleDelete} />
            </div>
          </div>

          {/* Chat test */}
          <div className="w-96 shrink-0 min-h-0 flex flex-col">
            <KBChatTest />
          </div>
        </div>

        {/* Edit form Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>แก้ไขข้อมูล</DialogTitle>
            </DialogHeader>
            {selectedItem && (
              <KBEditForm
                key={selectedItem.id + "-dialog"}
                item={selectedItem}
                onSaved={() => { fetchItems(); setSelectedItem(null); }}
                onDeleted={() => handleDelete(selectedItem.id)}
                onCancel={() => setSelectedItem(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}