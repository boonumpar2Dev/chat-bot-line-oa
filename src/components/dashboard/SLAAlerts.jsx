import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_LABEL = {
  pending_quote: "รอใบเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม",
};

export default function SLAAlerts({ customers, slaHours }) {
  const now = Date.now();
  const slaMs = (slaHours || 24) * 60 * 60 * 1000;

  // Find customers stuck in pending statuses past SLA
  const overdue = customers
    .filter(c => ['pending_quote', 'pending_confirm'].includes(c.status))
    .map(c => {
      const statusTime = c.sla_deadline
        ? new Date(c.sla_deadline).getTime()
        : new Date(c.updated_date).getTime() + slaMs;
      const overMs = now - statusTime;
      return { ...c, overdueMs: overMs, overdueHours: Math.floor(overMs / 3600000) };
    })
    .filter(c => c.overdueMs > 0)
    .sort((a, b) => b.overdueMs - a.overdueMs);

  if (overdue.length === 0) return null;

  return (
    <div className="stat-card border-l-4 border-l-red-500" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-red-600" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">SLA Alert</h3>
          <p className="text-[10px] text-muted-foreground">ลูกค้าที่ค้างเกินกำหนด ({slaHours} ชม.)</p>
        </div>
        <span className="ml-auto bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{overdue.length}</span>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {overdue.map(c => (
          <Link
            key={c.id}
            to={createPageUrl("Chats")}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 transition-colors group no-underline"
          >
            {c.picture_url ? (
              <img src={c.picture_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                {(c.nickname || c.display_name || "?").charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{c.nickname || c.display_name || "ไม่ทราบชื่อ"}</div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  {STATUS_LABEL[c.status] || c.status}
                </span>
                <span className="text-red-600 font-semibold flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  เกิน {c.overdueHours > 0 ? `${c.overdueHours} ชม.` : 'กำหนด'}
                </span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}