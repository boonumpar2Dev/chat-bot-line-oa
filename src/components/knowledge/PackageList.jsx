import { useState } from "react";
import { Search, Package, Loader2, FolderOpen } from "lucide-react";

export default function PackageList({ packages, selectedId, onSelect, loading, categoryFilter, onCategoryFilter, categories }) {
  const [search, setSearch] = useState("");

  const filtered = packages.filter(p =>
    !search || (p.name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const cats = categories || [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="ค้นหาแพ็กเกจ" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => onCategoryFilter?.("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${categoryFilter === "all" || !categoryFilter ? "bg-green-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            ทั้งหมด
          </button>
          {cats.map(c => (
            <button key={c.id} onClick={() => onCategoryFilter?.(c.name)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${categoryFilter === c.name ? "bg-green-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">ยังไม่มีแพ็กเกจ</div>
      ) : (
        <div className="space-y-1">
          {filtered.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => onSelect(pkg)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors border ${selectedId === pkg.id ? "bg-green-50 border-green-300" : "bg-card border-border hover:bg-muted/50"}`}
            >
              <div className="flex items-start gap-3">
                {pkg.image_urls?.[0] ? (
                  <img src={pkg.image_urls[0]} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-input" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground truncate">{pkg.name}</span>
                    {pkg.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0">{pkg.category}</span>
                    )}
                  </div>
                  {pkg.pricing_tiers?.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {pkg.pricing_tiers.length} ระดับราคา
                    </div>
                  )}
                  {pkg.min_condition && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{pkg.min_condition}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}