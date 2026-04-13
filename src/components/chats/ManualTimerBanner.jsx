import { useState, useEffect } from "react";
import { Timer, Zap, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ManualTimerBanner({ customer, onUpdate }) {
  const [timeLeft, setTimeLeft] = useState(null);
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

  const formatTime = () => {
    if (days > 0) return `${days} วัน ${hours} ชม.`;
    if (hours > 0) return `${hours} ชม. ${mins} นาที`;
    return `${mins} นาที`;
  };

  const handleResume = async () => {
    setResuming(true);
    const now = new Date().toISOString();
    await base44.entities.Customer.update(customer.id, {
      ai_active: true,
      manual_chat_until: null,
      ai_resumed_at: now,
    });
    onUpdate({ ...customer, ai_active: true, manual_chat_until: null, ai_resumed_at: now });
    toast.success("ปลุกบอทสำเร็จ — AI กลับมาทำงานทันที");
    setResuming(false);
  };

  return (
    <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-200 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-purple-700 min-w-0">
        <Timer className="w-3.5 h-3.5 shrink-0" />
        <span>
          Manual Chat Timer — บอทพัก <strong>{formatTime()}</strong>
        </span>
      </div>
      <button
        onClick={handleResume}
        disabled={resuming}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 shrink-0 transition-colors"
      >
        {resuming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
        ปลุกบอททันที
      </button>
    </div>
  );
}