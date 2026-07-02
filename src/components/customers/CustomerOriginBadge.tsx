import { useState } from "react";
import { ChevronDown, Sparkles, RotateCcw, History, AlertCircle, Repeat, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Origin = "new" | "returning" | "reactivated" | "needs_review" | "legacy" | "post_event_followup";

const ORIGIN_OPTIONS: Array<{
  value: Origin;
  label: string;
  short: string;
  desc: string;
  badgeClass: string;
  dotClass: string;
  icon: typeof Sparkles;
}> = [
  {
    value: "new",
    label: "ลูกค้าใหม่",
    short: "ลูกค้าใหม่",
    desc: "ทักมาครั้งแรก ยังไม่เคยจัดงาน",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    icon: Sparkles,
  },
  {
    value: "returning",
    label: "ลูกค้าเก่า (มีประวัติงาน)",
    short: "ลูกค้าเก่า",
    desc: "มีประวัติงานในระบบ (customer_events) แล้วกลับมาทักใหม่",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    dotClass: "bg-purple-500",
    icon: RotateCcw,
  },
  {
    value: "reactivated",
    label: "กลับมาทักใหม่",
    short: "Reactivated",
    desc: "เคยทักไว้ เงียบไป ≥ 30 วัน แล้วกลับมา",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    icon: Repeat,
  },
  {
    value: "needs_review",
    label: "ต้องตรวจสอบ",
    short: "Needs Review",
    desc: "ข้อมูลเก่าไม่ครบ ต้องเช็กก่อนจัดกลุ่ม (legacy/returning ที่ไม่มี event/สถานะ complete แต่ไม่มี event)",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
    icon: AlertCircle,
  },
  {
    value: "legacy",
    label: "ลูกค้าก่อนเปิดระบบ (เลิกใช้)",
    short: "Legacy",
    desc: "หมวดเก่า — ไม่ใช้แล้ว ระบบย้ายไป Needs Review",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
    icon: History,
  },
];

interface Props {
  customer: { id: string; customer_origin?: string | null };
  onUpdate: (patch: any) => void;
  size?: "sm" | "md";
}

export default function CustomerOriginBadge({ customer, onUpdate, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const current = ORIGIN_OPTIONS.find(o => o.value === (customer.customer_origin || "new")) || ORIGIN_OPTIONS[0];
  const Icon = current.icon;

  const handleChange = async (val: Origin) => {
    setOpen(false);
    if (val === (customer.customer_origin || "new")) return;
    const { error } = await supabase
      .from("customers")
      .update({ customer_origin: val })
      .eq("id", customer.id);
    if (error) {
      toast.error("อัปเดตหมวดลูกค้าไม่สำเร็จ: " + error.message);
      return;
    }
    onUpdate({ customer_origin: val });
    toast.success(`เปลี่ยนหมวดเป็น "${ORIGIN_OPTIONS.find(o => o.value === val)?.label}"`);
  };

  const pillSize = size === "sm"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-xs px-2 py-1";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "rounded-full font-medium flex items-center gap-1 hover:opacity-80 cursor-pointer border",
          pillSize,
          current.badgeClass,
        )}
        title={current.desc}
      >
        <Icon className="w-3 h-3" />
        <span>{current.short}</span>
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border rounded-lg shadow-lg py-1 min-w-[240px]">
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide border-b">
              หมวดลูกค้า
            </div>
            {ORIGIN_OPTIONS.map(opt => {
              const OptIcon = opt.icon;
              const active = opt.value === (customer.customer_origin || "new");
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange(opt.value)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-start gap-2",
                    active && "bg-muted/50",
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", opt.dotClass)} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                      <OptIcon className="w-3 h-3" />
                      {opt.label}
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">{opt.desc}</span>
                  </span>
                  {active && <span className="text-[9px] text-primary mt-1">●</span>}
                </button>
              );
            })}
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
              💡 มีประวัติงาน (customer_events) = Returning · ข้อมูลเก่าไม่ครบ = Needs Review (แอดมินกดยืนยันเป็น New/Returning/Reactivated ได้)
            </div>
          </div>
        </>
      )}
    </div>
  );
}
