import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "new", label: "ลูกค้าใหม่", color: "bg-blue-100 text-blue-700" },
  { value: "returning", label: "ลูกค้าเก่า", color: "bg-purple-100 text-purple-700" },
  { value: "pending_quote", label: "รอใบเสนอราคา", color: "bg-orange-100 text-orange-700" },
  { value: "pending_confirm", label: "รอคอนเฟิร์ม", color: "bg-yellow-100 text-yellow-700" },
  { value: "confirmed", label: "คอนเฟิร์ม", color: "bg-green-100 text-green-700" },
  { value: "cancelled", label: "ยกเลิก", color: "bg-red-100 text-red-700" },
];

const AI_OFF_STATUSES = ["pending_quote", "pending_confirm", "confirmed"];

export default function StatusSelector({ customer, onUpdate }) {
  const [open, setOpen] = useState(false);

  const handleChange = async (newStatus) => {
    setOpen(false);
    if (newStatus === customer.status) return;

    const updateData = { status: newStatus };
    
    // Stage Control: force AI off for critical statuses
    if (AI_OFF_STATUSES.includes(newStatus)) {
      updateData.ai_active = false;
    }

    // Set SLA deadline when moving to trackable status
    if (["pending_quote", "pending_confirm"].includes(newStatus)) {
      // SLA deadline will be calculated in Dashboard from updated_date + sla_hours
    }

    await base44.entities.Customer.update(customer.id, updateData);
    
    const updated = { ...customer, ...updateData };
    onUpdate(updated);

    if (AI_OFF_STATUSES.includes(newStatus)) {
      toast.info(`ปิด AI อัตโนมัติ — สเตตัส: ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
    } else {
      toast.success("อัปเดตสเตตัสแล้ว");
    }
  };

  const current = STATUS_OPTIONS.find(s => s.value === customer.status) || STATUS_OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer ${current.color}`}
      >
        {current.label}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleChange(opt.value)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${
                  opt.value === customer.status ? "font-semibold" : ""
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${opt.color.split(" ")[0]}`} />
                {opt.label}
                {AI_OFF_STATUSES.includes(opt.value) && (
                  <span className="text-[9px] text-red-400 ml-auto">ปิด AI</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}