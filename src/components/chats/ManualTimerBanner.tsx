import { useEffect, useState } from "react";
import { Timer, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  if (!timeLeft || timeLeft <= 0 || customer.ai_active) return null;

  const days = Math.floor(timeLeft / 86400000);
  const hours = Math.floor((timeLeft % 86400000) / 3600000);
  const mins = Math.floor((timeLeft % 3600000) / 60000);
  const fmt = days > 0 ? `${days} วัน ${hours} ชม.` : hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;

  const handleResume = async () => {
    setResuming(true);
    const now = new Date().toISOString();
    // ถ้าลูกค้าอยู่ในสถานะปกป้อง (confirmed/postponed) → ตั้ง admin_bot_override=true
    // เพื่อให้ระบบไม่ปิดบอทอัตโนมัติอีก (เคารพการตัดสินใจของแอด)
    const isProtected = ["confirmed", "confirmed_returning", "postponed"].includes(customer.status);
    const patch: any = { ai_active: true, manual_chat_until: null, ai_resumed_at: now };
    if (isProtected) patch.admin_bot_override = true;
    await supabase.from("customers").update(patch).eq("id", customer.id);
    onUpdate({ ...customer, ...patch });
    toast.success(isProtected ? "ปลุกบอท + เปิด override (ระบบจะไม่ปิดอัตโนมัติ)" : "ปลุกบอทสำเร็จ");
    setResuming(false);
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
