import { useEffect, useState } from "react";
import { Timer, Zap, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const HANDOFF_REASON_LABEL: Record<string, string> = {
  handoff_missing_source: "ไม่มีข้อมูลอ้างอิงใน KB",
  handoff_conflicting_source: "ข้อมูล KB ขัดกัน",
  handoff_source_mismatch: "ข้อมูลอ้างอิงไม่ตรง KB ที่ค้นได้",
  handoff_invalid_schema: "AI ตอบไม่ตรงรูปแบบ",
};
const HANDOFF_CATEGORY_LABEL: Record<string, string> = {
  pricing: "ราคา",
  addon: "ค่าเพิ่มเมนู",
  service_fee: "ค่าบริการ",
  discount: "ส่วนลด",
  promotion: "โปรโมชั่น",
  min_order: "ขั้นต่ำ",
  delivery_fee: "ค่าขนส่ง",
  package_condition: "เงื่อนไขแพ็กเกจ",
  none: "-",
};

export default function ManualTimerBanner({ customer, onUpdate }: { customer: any; onUpdate: (c: any) => void }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!customer?.manual_chat_until) { setTimeLeft(null); return; }
    const end = new Date(customer.manual_chat_until).getTime();
    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) { setTimeLeft(null); return; }
      setTimeLeft(diff);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [customer?.manual_chat_until]);

  if (!timeLeft || timeLeft <= 0) return null;

  const days = Math.floor(timeLeft / 86400000);
  const hours = Math.floor((timeLeft % 86400000) / 3600000);
  const mins = Math.floor((timeLeft % 3600000) / 60000);
  const fmt = days > 0 ? `${days} วัน ${hours} ชม.` : hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;

  // Soft banner สำหรับ short pause (ai_active=true + manual_chat_until future)
  // แสดง "AI พักชั่วคราวถึง HH:mm — จะกลับมาอัตโนมัติ" — Toggle ยัง ON, ห้ามให้ดูปิดถาวร
  if (customer.ai_active) {
    const until = new Date(customer.manual_chat_until);
    const hh = String(until.getHours()).padStart(2, "0");
    const mm = String(until.getMinutes()).padStart(2, "0");
    return (
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
        <Timer className="w-3.5 h-3.5 shrink-0 text-amber-600"/>
        <span className="text-xs text-amber-800">
          AI พักชั่วคราวถึง <strong>{hh}:{mm}</strong> — จะกลับมาอัตโนมัติ
        </span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-medium">พักชั่วคราว</span>
      </div>
    );
  }

  const handleResume = async () => {
    setResuming(true);
    try {
      const now = new Date().toISOString();
      // ดึง status สดจาก DB กัน race
      const { data: fresh } = await supabase.from("customers").select("status").eq("id", customer.id).maybeSingle();
      const liveStatus = fresh?.status ?? customer.status;
      const isProtected = ["confirmed", "confirmed_returning", "postponed"].includes(liveStatus);
      const patch: any = { ai_active: true, manual_chat_until: null, ai_resumed_at: now };
      if (isProtected) patch.admin_bot_override = true;
      const { error } = await supabase.from("customers").update(patch).eq("id", customer.id);
      if (error) {
        console.error("[ManualTimerBanner] resume failed:", error, { id: customer.id, patch });
        toast.error("ปลุกบอทไม่สำเร็จ: " + error.message);
        return;
      }
      onUpdate(patch); // ส่งเฉพาะ patch (กันทับของใหม่จาก realtime)
      toast.success(isProtected ? "ปลุกบอท + เปิด override (ระบบจะไม่ปิดอัตโนมัติ)" : "ปลุกบอทสำเร็จ");
    } finally {
      setResuming(false);
    }
  };

  return (
    <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-200 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-purple-700 min-w-0">
        <Timer className="w-3.5 h-3.5 shrink-0"/>
        <span>Manual Chat — บอทพัก <strong>{fmt}</strong></span>
      </div>
      <button onClick={handleResume} disabled={resuming}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 shrink-0">
        {resuming ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3"/>} ปลุกบอท
      </button>
    </div>
  );
}
