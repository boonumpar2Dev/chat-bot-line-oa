import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "new", label: "ลูกค้าใหม่", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { value: "inquiry", label: "สอบถาม", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  { value: "returning", label: "ลูกค้าเก่า", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { value: "pending_quote", label: "รอเสนอราคา", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { value: "pending_confirm", label: "รอคอนเฟิร์ม", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  { value: "confirmed", label: "คอนเฟิร์ม", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { value: "cancelled", label: "ยกเลิก", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
] as const;

const AI_OFF_STATUSES = ["pending_quote", "pending_confirm", "confirmed"];

export default function StatusSelector({ customer, onUpdate }: { customer: any; onUpdate: (c: any) => void }) {
  const [open, setOpen] = useState(false);

  const handleChange = async (newStatus: string) => {
    setOpen(false);
    if (newStatus === customer.status) return;
    const updateData: any = { status: newStatus };
    if (AI_OFF_STATUSES.includes(newStatus)) updateData.ai_active = false;
    await supabase.from("customers").update(updateData).eq("id", customer.id);
    onUpdate({ ...customer, ...updateData });
    if (AI_OFF_STATUSES.includes(newStatus)) {
      toast.info(`ปิด AI อัตโนมัติ — ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
    } else {
      toast.success("อัปเดตสเตตัสแล้ว");
    }
  };

  const current = STATUS_OPTIONS.find(s => s.value === customer.status) || STATUS_OPTIONS[0];

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 hover:opacity-80 cursor-pointer", current.color)}>
        {current.label}<ChevronDown className="w-2.5 h-2.5"/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border rounded-lg shadow-lg py-1 min-w-[160px]">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleChange(opt.value)}
                className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2",
                  opt.value === customer.status && "font-semibold")}>
                <span className={cn("w-2 h-2 rounded-full", opt.dot)}/>
                {opt.label}
                {AI_OFF_STATUSES.includes(opt.value) && <span className="text-[9px] text-destructive ml-auto">ปิด AI</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
