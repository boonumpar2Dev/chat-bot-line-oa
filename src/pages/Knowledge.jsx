import { useState, useEffect } from "react";
import { Plus, FileText, Loader2, ArrowLeft, Package, BookOpen, List, FolderOpen, Percent } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KBItemList from "@/components/knowledge/KBItemList.jsx";
import KBEditForm from "@/components/knowledge/KBEditForm.jsx";
import KBChatTest from "@/components/knowledge/KBChatTest.jsx";
import PackageList from "@/components/knowledge/PackageList.jsx";
import PackageCatalogForm from "@/components/knowledge/PackageCatalogForm.jsx";
import CategoryManager from "@/components/knowledge/CategoryManager.jsx";
import PromotionList from "@/components/knowledge/PromotionList.jsx";
import PromotionForm from "@/components/knowledge/PromotionForm.jsx";

const TABS = [
  { id: "base", label: "ข้อมูลส่วนกลาง", icon: BookOpen, desc: "พิธีสงฆ์ อุปกรณ์ ข้อมูลที่ใช้ร่วมกัน" },
  { id: "catalog", label: "แคตตาล็อกแพ็กเกจ", icon: Package, desc: "แพ็กเกจราคา โบรชัวร์ เมนูอาหาร" },
  { id: "promo", label: "โปรโมชั่น", icon: Percent, desc: "ส่วนลด ของแถม โปรโมชั่นพิเศษ" },
  { id: "general", label: "ข้อมูลทั่วไป", icon: List, desc: "FAQ ข้อมูลอื่นๆ" },
];

export default function Knowledge() {
  const [activeTab, setActiveTab] = useState("base");
  const [items, setItems] = useState([]);
  const [packages, setPackages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loadingKB, setLoadingKB] = useState(true);
  const [loadingPkg, setLoadingPkg] = useState(true);
  const [loadingPromo, setLoadingPromo] = useState(true);
  const [selectedPromo, setSelectedPromo] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState("list");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    base44.entities.KnowledgeBase.list("-created_date").then(data => { setItems(data || []); setLoadingKB(false); });
    base44.entities.CateringPackage.filter({ is_active: true }, "-created_date").then(data => { setPackages(data || []); setLoadingPkg(false); });
    base44.entities.PackageCategory.list("sort_order").then(data => setCategories(data || []));
    base44.entities.Promotion.filter({ is_active: true }, "-created_date").then(data => { setPromotions(data || []); setLoadingPromo(false); });
  };

  const refreshCategories = async () => {
    const data = await base44.entities.PackageCategory.list("sort_order");
    setCategories(data || []);
  };

  // Split KB items by type
  const baseItems = items.filter(i => i.type === "file");
  const priceItems = items.filter(i => i.type === "price");

  const handleAddKB = async (type) => {
    setAdding(true);
    const title = type === "price" ? "รายการราคาใหม่" : "ข้อมูลใหม่";
    const created = await base44.entities.KnowledgeBase.create({ title, content: "", type, status: "processing" });
    setItems(prev => [created, ...prev]);
    setSelectedItem(created);
    setAdding(false);
    setView("edit");
  };

  const handleAddPkg = () => {
    setSelectedPkg({ name: "", pricing_tiers: [{ tier_name: "", guest_count: "", price: "" }] });
    setView("edit");
  };

  const handleDuplicatePkg = (pkg) => {
    const copy = {
      name: pkg.name + " (สำเนา)",
      category: pkg.category || "",
      description: pkg.description || "",
      min_condition: pkg.min_condition || "",
      pricing_tiers: pkg.pricing_tiers || [],
      custom_attributes: pkg.custom_attributes || [],
      ai_instruction: pkg.ai_instruction || "",
      notes: pkg.notes || "",
      image_urls: pkg.image_urls || [],
    };
    setSelectedPkg(copy);
    setView("edit");
  };

  const handleDeleteKB = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedItem?.id === id) { setSelectedItem(null); setView("list"); }
  };

  const handleDeletePkg = () => {
    if (selectedPkg?.id) setPackages(prev => prev.filter(p => p.id !== selectedPkg.id));
    setSelectedPkg(null);
    setView("list");
  };

  const refreshPkgs = async () => {
    const data = await base44.entities.CateringPackage.filter({ is_active: true }, "-created_date");
    setPackages(data || []);
    setSelectedPkg(null);
    setView("list");
  };

  const handleAddPromo = () => {
    setSelectedPromo({ name: "" });
    setView("edit");
  };

  const handleDeletePromo = () => {
    if (selectedPromo?.id) setPromotions(prev => prev.filter(p => p.id !== selectedPromo.id));
    setSelectedPromo(null);
    setView("list");
  };

  const refreshPromos = async () => {
    const data = await base44.entities.Promotion.filter({ is_active: true }, "-created_date");
    setPromotions(data || []);
    setSelectedPromo(null);
    setView("list");
  };

  const refreshKB = async () => {
    const data = await base44.entities.KnowledgeBase.list("-created_date");
    setItems(data || []);
    setSelectedItem(null);
    setView("list");
  };

  // Current list based on tab
  const currentKBItems = activeTab === "base" ? baseItems : priceItems;
  const kbType = activeTab === "base" ? "file" : "price";

  // ── MOBILE ──
  const MobileView = () => {
    if (view === "edit" && activeTab === "promo" && selectedPromo) {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => { setView("list"); setSelectedPromo(null); }} className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
            <span className="font-semibold text-foreground">{selectedPromo.id ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่นใหม่"}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PromotionForm key={selectedPromo.id || "new"} item={selectedPromo} categories={categories} onSaved={refreshPromos} onDeleted={handleDeletePromo} onCancel={() => { setView("list"); setSelectedPromo(null); }} />
          </div>
        </div>
      );
    }
    if (view === "edit" && activeTab === "catalog" && selectedPkg) {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => { setView("list"); setSelectedPkg(null); }} className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
            <span className="font-semibold text-foreground">{selectedPkg.id ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PackageCatalogForm key={selectedPkg.id || "new"} item={selectedPkg} categories={categories} onSaved={refreshPkgs} onDeleted={handleDeletePkg} onCancel={() => { setView("list"); setSelectedPkg(null); }} onDuplicate={handleDuplicatePkg} />
          </div>
        </div>
      );
    }
    if (view === "edit" && selectedItem) {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => { setView("list"); setSelectedItem(null); }} className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
            <span className="font-semibold text-foreground">แก้ไขข้อมูล</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <KBEditForm key={selectedItem.id} item={selectedItem} onSaved={refreshKB} onDeleted={() => handleDeleteKB(selectedItem.id)} onCancel={() => { setView("list"); setSelectedItem(null); }} />
          </div>
        </div>
      );
    }
    if (view === "chat") {
      return (
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
            <button onClick={() => setView("list")} className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
            <span className="font-semibold text-foreground">แชททดสอบ AI</span>
          </div>
          <div className="flex-1 overflow-hidden p-4"><KBChatTest /></div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="p-4 border-b border-border bg-card shrink-0">
          <h1 className="text-lg font-bold text-foreground">สอน AI</h1>
          <p className="text-muted-foreground text-xs mt-0.5">จัดการข้อมูลทั้งหมดสำหรับ AI ตอบลูกค้า</p>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? "border-green-600 text-green-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-b border-border shrink-0">
          {activeTab === "promo" ? (
            <button onClick={handleAddPromo}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">
              <Plus className="w-4 h-4" /> เพิ่มโปรโมชั่น
            </button>
          ) : activeTab === "catalog" ? (
            <>
              <button onClick={handleAddPkg} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                <Plus className="w-4 h-4" /> เพิ่มแพ็กเกจ
              </button>
              <button onClick={() => setShowCategoryManager(true)} className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted">
                <FolderOpen className="w-4 h-4" /> ประเภท
              </button>
            </>
          ) : (
            <button onClick={() => handleAddKB(kbType)} disabled={adding}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted">
              <Plus className="w-4 h-4" /> เพิ่มข้อมูล
            </button>
          )}
          <button onClick={() => setView("chat")}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
            ทดสอบ AI
          </button>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "promo" ? (
            <PromotionList promotions={promotions} selectedId={selectedPromo?.id || null} onSelect={(p) => { setSelectedPromo(p); setView("edit"); }} loading={loadingPromo} />
          ) : activeTab === "catalog" ? (
            <PackageList packages={categoryFilter && categoryFilter !== "all" ? packages.filter(p => p.category === categoryFilter) : packages} selectedId={selectedPkg?.id || null} onSelect={(pkg) => { setSelectedPkg(pkg); setView("edit"); }} loading={loadingPkg} categories={categories} categoryFilter={categoryFilter} onCategoryFilter={setCategoryFilter} />
          ) : (
            <KBItemList items={currentKBItems} selectedId={selectedItem?.id || null} onSelect={(item) => { setSelectedItem(item); setView("edit"); }} onDelete={handleDeleteKB} />
          )}
        </div>
      </div>
    );
  };

  // ── DESKTOP ──
  return (
    <>
      <div className="lg:hidden h-screen overflow-hidden"><MobileView /></div>

      <div className="hidden lg:flex flex-col h-screen overflow-hidden p-6 gap-4">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-foreground">สอน AI</h1>
          <p className="text-muted-foreground text-sm mt-0.5">จัดการข้อมูลทั้งหมดสำหรับ AI ตอบลูกค้า</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 shrink-0 border-b border-border">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedItem(null); setSelectedPkg(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-green-600 text-green-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className="text-xs text-muted-foreground">
                ({activeTab === tab.id && tab.id === "catalog" ? packages.length : tab.id === "catalog" ? packages.length : tab.id === "base" ? baseItems.length : priceItems.length})
              </span>
            </button>
          ))}
        </div>

        {/* Action bar */}
        <div className="flex gap-2 shrink-0">
          {activeTab === "promo" ? (
            <button onClick={handleAddPromo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">
              <Plus className="w-4 h-4" /> เพิ่มโปรโมชั่น
            </button>
          ) : activeTab === "catalog" ? (
            <div className="flex gap-2">
              <button onClick={handleAddPkg}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                <Plus className="w-4 h-4" /> เพิ่มแพ็กเกจ
              </button>
              <button onClick={() => setShowCategoryManager(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted">
                <FolderOpen className="w-4 h-4" /> จัดการประเภท
              </button>
            </div>
          ) : (
            <button onClick={() => handleAddKB(kbType)} disabled={adding}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted">
              <Plus className="w-4 h-4" /> เพิ่มข้อมูล
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            {activeTab === "promo" ? (
              <PromotionList promotions={promotions} selectedId={selectedPromo?.id || null} onSelect={setSelectedPromo} loading={loadingPromo} />
            ) : activeTab === "catalog" ? (
              <PackageList packages={categoryFilter && categoryFilter !== "all" ? packages.filter(p => p.category === categoryFilter) : packages} selectedId={selectedPkg?.id || null} onSelect={setSelectedPkg} loading={loadingPkg} categories={categories} categoryFilter={categoryFilter} onCategoryFilter={setCategoryFilter} />
            ) : (
              <KBItemList items={currentKBItems} selectedId={selectedItem?.id || null} onSelect={setSelectedItem} onDelete={handleDeleteKB} />
            )}
          </div>
          <div className="w-96 shrink-0 min-h-0 flex flex-col">
            <KBChatTest />
          </div>
        </div>

        {/* KB Edit Dialog */}
        <Dialog open={activeTab !== "catalog" && !!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>แก้ไขข้อมูล</DialogTitle></DialogHeader>
            {selectedItem && (
              <KBEditForm key={selectedItem.id + "-dlg"} item={selectedItem}
                onSaved={() => { refreshKB(); setSelectedItem(null); }}
                onDeleted={() => handleDeleteKB(selectedItem.id)}
                onCancel={() => setSelectedItem(null)} />
            )}
          </DialogContent>
        </Dialog>

        {/* Package Edit Dialog */}
        <Dialog open={activeTab === "catalog" && !!selectedPkg} onOpenChange={(open) => { if (!open) setSelectedPkg(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedPkg?.id ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}</DialogTitle></DialogHeader>
            {selectedPkg && (
              <PackageCatalogForm key={selectedPkg.id || "new-dlg"} item={selectedPkg} categories={categories}
                onSaved={refreshPkgs} onDeleted={handleDeletePkg}
                onCancel={() => setSelectedPkg(null)} onDuplicate={handleDuplicatePkg} />
            )}
          </DialogContent>
        </Dialog>
        {/* Promotion Edit Dialog */}
        <Dialog open={activeTab === "promo" && !!selectedPromo} onOpenChange={(open) => { if (!open) setSelectedPromo(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedPromo?.id ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่นใหม่"}</DialogTitle></DialogHeader>
            {selectedPromo && (
              <PromotionForm key={selectedPromo.id || "new-promo-dlg"} item={selectedPromo} categories={categories}
                onSaved={refreshPromos} onDeleted={handleDeletePromo}
                onCancel={() => setSelectedPromo(null)} />
            )}
          </DialogContent>
        </Dialog>

      {/* Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>จัดการประเภทแพ็กเกจ</DialogTitle></DialogHeader>
          <CategoryManager categories={categories} onRefresh={refreshCategories} />
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}