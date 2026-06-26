import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type QLeadRow = {
  customer_id: string;
  lead_type: "new" | "returning" | "reactivated" | "needs_review";
  display_name: string | null;
  nickname: string | null;
  status: string;
  customer_origin: string;
  entered_pending_at: string;
  last_message_at: string;
  created_at: string;
  prev_message_at: string | null;
  has_events: boolean;
};

export function QualifiedLeadTypeSection() {
  const { data } = useQuery({
    queryKey: ["dashboard-qualified-lead-types-today"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_qualified_lead_types_today" as any);
      if (error) throw error;
      return (data ?? []) as QLeadRow[];
    },
    refetchInterval: 60_000,
  });

  const byType = (t: QLeadRow["lead_type"]) => (data ?? []).filter((r) => r.lead_type === t);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-base font-semibold">Qualified Lead Type Today (Lead เข้า Pipeline วันนี้)</h2>
        <p className="text-[11px] text-muted-foreground">
          นับ unique ลูกค้าที่เข้า pending_quote วันนี้ (Asia/Bangkok)
        </p>
      </div>
      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded px-2 py-1.5">
        ✅ นับจากลูกค้าที่เข้าสถานะได้ข้อมูลครบ / pending_quote วันนี้ ไม่ใช่ทุกคนที่ทักเข้ามา
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QLeadCard color="#378ADD" label="New Qualified Lead" hint="ยังไม่เคยจัดงาน เข้า pipeline วันนี้" rows={byType("new")} />
        <QLeadCard color="#22A06B" label="Reactivated Qualified" hint="เงียบ ≥ 30 วัน กลับมาเข้า pipeline" rows={byType("reactivated")} />
        <QLeadCard color="#7F77DD" label="Returning Qualified" hint="มีประวัติงาน กลับมาเข้า pipeline อีก" rows={byType("returning")} />
        <QLeadCard color="#D97706" label="Needs Review" hint="ข้อมูลเก่าไม่ครบ ต้องเช็กก่อนจัดกลุ่ม" rows={byType("needs_review")} highlight />
      </div>
    </div>
  );
}

function QLeadCard({
  color, label, hint, rows, highlight,
}: {
  color: string;
  label: string;
  hint: string;
  rows: QLeadRow[];
  highlight?: boolean;
}) {
  return (
    <Link
      to="/chats?status=pending_quote"
      className={`text-left rounded-lg border bg-card p-3 flex items-center gap-3 hover:bg-muted/40 hover:shadow-soft transition-all ${highlight ? "border-amber-300 dark:border-amber-700/60" : ""}`}
    >
      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display font-semibold text-xl">{rows.length}</p>
        <p className="text-[10px] text-muted-foreground line-clamp-2">{hint}</p>
      </div>
    </Link>
  );
}
