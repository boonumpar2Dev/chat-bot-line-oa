import { useState, useEffect } from "react";
import { Plus, FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import KBItemList from "@/components/knowledge/KBItemList.jsx";
import KBEditForm from "@/components/knowledge/KBEditForm.jsx";
import KBChatTest from "@/components/knowledge/KBChatTest.jsx";
import KBGithubImport from "@/components/knowledge/KBGithubImport.jsx";

export default function Knowledge() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

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
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedItem?.id === id) setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-4 lg:p-6 overflow-hidden">
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold text-foreground">เพิ่มข้อมูล</h1>
        <p className="text-muted-foreground text-sm mt-0.5">สอนวิธีตอบคำถามของลูกค้าให้ AI ของคุณ</p>
      </div>

      <div className="mb-4 shrink-0">
        <KBGithubImport onImported={fetchItems} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <button
          onClick={() => handleAddNew("file")}
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มข้อมูล
        </button>
        <button
          onClick={() => handleAddNew("price")}
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <FileText className="w-4 h-4" /> เพิ่มรายการราคา
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-auto">
          <div className="w-full lg:max-w-md shrink-0">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                จัดการข้อมูล
                <span className="text-muted-foreground font-normal text-xs cursor-help" title="AI ใช้ข้อมูลนี้ตอบกลับลูกค้า">ⓘ</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI ของคุณใช้ข้อมูลนี้เพื่อตอบกลับลูกค้า
              </p>
            </div>
            <KBItemList
              items={items}
              selectedId={selectedItem?.id || null}
              onSelect={setSelectedItem}
              onDelete={handleDelete}
            />
          </div>

          {selectedItem && (
            <>
              <div className="fixed inset-0 z-50 bg-background p-4 overflow-auto lg:hidden">
                <KBEditForm
                  key={selectedItem.id}
                  item={selectedItem}
                  onSaved={() => { fetchItems(); setSelectedItem(null); }}
                  onDeleted={() => handleDelete(selectedItem.id)}
                  onCancel={() => setSelectedItem(null)}
                />
              </div>
              <div className="hidden lg:block flex-1 overflow-y-auto bg-card rounded-xl border border-border p-5 min-w-0">
                <KBEditForm
                  key={selectedItem.id + "-desktop"}
                  item={selectedItem}
                  onSaved={() => { fetchItems(); setSelectedItem(null); }}
                  onDeleted={() => handleDelete(selectedItem.id)}
                  onCancel={() => setSelectedItem(null)}
                />
              </div>
            </>
          )}
        </div>

        <div className="w-full lg:w-96 shrink-0 h-80 lg:h-auto">
          <KBChatTest />
        </div>
      </div>
    </div>
  );
}