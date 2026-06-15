import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { syncTagsForStatusChange } from "@/lib/statusTags";


const STATUS_OPTIONS = [
  { value: "new", label: "ลูกค้าใหม่", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { value: "inquiry", label: "สอบถาม", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  { value: "returning", label: "ลูกค้าเก่า", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { value: "pending_quote", label: "รอเสนอราคา", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { value: "pending_confirm", label: "รอคอนเฟิร์ม", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  { value: "confirmed", label: "คอนเฟิร์ม", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { value: "confirmed_returning", label: "คอนเฟิร์ม (ลูกค้าเก่า)", color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-600" },
  { value: "postponed", label: "เลื่อนวันจัดงาน(มัดจำแล้ว)", color: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-600" },
  { value: "completed", label: "ปิดงาน", color: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
  { value: "cancelled", label: "ยกเลิก", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
] as const;

const AI_OFF_STATUSES = ["pending_quote", "pending_confirm", "confirmed", "confirmed_returning"];
const AI_ON_STATUSES = ["postponed"];
// สถานะที่ต้อง "ล้าง admin_bot_override" — กลับมาทำงานตามปกติ
const CLEAR_OVERRIDE_STATUSES = ["completed", "cancelled", "pending_quote", "new", "inquiry", "returning"];

export default function StatusSelector({ customer, onUpdate }: { customer: any; onUpdate: (c: any) => void }) {
  const [open, setOpen] = useState(false);

  const handleChange = async (newStatus: string) => {
    setOpen(false);
    if (newStatus === customer.status) return;
    const updateData: any = { status: newStatus, admin_unseen: false, admin_seen_at: new Date().toISOString() };
    if (AI_OFF_STATUSES.includes(newStatus)) {
      updateData.ai_active = false;
      updateData.admin_bot_override = false; // เข้าโหมดปกป้อง — รอแอดมินตัดสินใจ
    }
    if (AI_ON_STATUSES.includes(newStatus)) {
      updateData.ai_active = true;
      updateData.manual_chat_until = null;
      updateData.admin_bot_override = false;
    }
    if (newStatus === "completed") {
      // ปิดงาน: บอทกลับมาทำงานปกติ — ลูกค้าทักใหม่ = inquiry ใหม่
      updateData.ai_active = true;
      updateData.manual_chat_until = null;
      updateData.admin_bot_override = false;
    }
    if (CLEAR_OVERRIDE_STATUSES.includes(newStatus) && !AI_OFF_STATUSES.includes(newStatus)) {
      updateData.admin_bot_override = false;
    }
    // sync tags: ถอด tag ของ status เก่า + เพิ่ม tag ของ status ใหม่
    try {
      updateData.tags = await syncTagsForStatusChange(customer.status, newStatus, customer.tags);
    } catch (e) {
      // ถ้าโหลด map ไม่ได้ ให้ข้าม sync (ไม่ทำให้การเปลี่ยน status ล้มเหลว)
    }
    await supabase.from("customers").update(updateData).eq("id", customer.id);
    onUpdate({ ...customer, ...updateData });
    if (newStatus === "completed") {
      toast.success("ปิดงานแล้ว — บอทกลับมาทำงานปกติ");
    } else if (AI_OFF_STATUSES.includes(newStatus)) {
      toast.info(`ปิด AI อัตโนมัติ — ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
    } else if (AI_ON_STATUSES.includes(newStatus)) {
      toast.success(`เปิด AI กลับให้อัตโนมัติ — ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
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
