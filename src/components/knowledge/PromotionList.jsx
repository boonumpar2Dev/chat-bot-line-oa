import { useState } from "react";
import { Search, Percent, Loader2 } from "lucide-react";

export default function PromotionList({ promotions, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState("");
  const filtered = promotions.filter(p => !search || (p.name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="ค้นหาโปรโมชั่น" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">ยังไม่มีโปรโมชั่น</div>
      ) : (
        <div className="space-y-1">
          {filtered.map(promo => (
            <button key={promo.id} onClick={() => onSelect(promo)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors border ${selectedId === promo.id ? "bg-orange-50 border-orange-300" : "bg-card border-border hover:bg-muted/50"}`}>
              <div className="flex items-start gap-3">
                {promo.image_urls?.[0] ? (
                  <img src={promo.image_urls[0]} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-input" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <Percent className="w-5 h-5 text-orange-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{promo.name}</div>
                  {promo.applicable_categories?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {promo.applicable_categories.map(c => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{c}</span>
                      ))}
                    </div>
                  )}
                  {promo.description && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{promo.description}</div>
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