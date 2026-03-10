import { DollarSign } from "lucide-react";

export default function CLVTable({ customers }) {
  const topCLV = customers
    .filter(c => (c.clv_amount || 0) > 0)
    .sort((a, b) => (b.clv_amount || 0) - (a.clv_amount || 0))
    .slice(0, 5);

  if (topCLV.length === 0) return null;

  return (
    <div className="stat-card">
      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
        <DollarSign className="w-4 h-4 text-emerald-600" /> Top CLV ลูกค้า
      </h3>
      <div className="space-y-2.5">
        {topCLV.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
            {c.picture_url ? (
              <img src={c.picture_url} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                {(c.nickname || c.display_name || "?").charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{c.nickname || c.display_name || "ไม่ทราบชื่อ"}</div>
            </div>
            <span className="text-sm font-bold text-emerald-600 shrink-0">
              ฿{(c.clv_amount || 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}