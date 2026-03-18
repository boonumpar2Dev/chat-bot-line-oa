import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, X, Bot, BotOff, Loader2, CheckCircle2, AlertCircle, Zap, Timer } from "lucide-react";

const STATUS_LABEL = {
  new: "ลูกค้าใหม่",
  returning: "ลูกค้าเก่า",
  pending_quote: "รอใบเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม",
  cancelled: "ยกเลิก",
};

function getTargetUid() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get("targetUid") || "";
  if (!uid) {
    const liffState = params.get("liff.state") || "";
    if (liffState) {
      const inner = new URLSearchParams(liffState.replace(/^\?/, ""));
      uid = inner.get("targetUid") || "";
    }
  }
  return uid;
}

export default function LiffPanel() {
  const targetUid = getTargetUid();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [eventDate, setEventDate] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!targetUid) {
      setError("ไม่พบ targetUid — กรุณาเปิดผ่านลิงก์ที่ถูกต้อง");
      setLoading(false);
      return;
    }
    loadCustomer();
  }, [targetUid]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("liffAdminPanel", {
        action: "get_customer",
        line_user_id: targetUid,
      });
      if (res.data?.ok && res.data.customer) {
        setCustomer(res.data.customer);
        setEventDate(res.data.customer.event_date || "");
      } else {
        setError(res.data?.error || "ไม่พบลูกค้ารายนี้ในระบบ");
      }
    } catch (e) {
      setError("ไม่สามารถโหลดข้อมูลได้ — " + (e.message || ""));
    }
    setLoading(false);
  };

  const doAction = async (action, extra = {}) => {
    setActionLoading(action);
    setToast(null);
    try {
      const res = await base44.functions.invoke("liffAdminPanel", {
        action,
        line_user_id: targetUid,
        ...extra,
      });
      if (res.data?.ok) {
        setToast({ type: "success", message: res.data.message });
        if (res.data.customer) {
          setCustomer(res.data.customer);
          setEventDate(res.data.customer.event_date || "");
        }
      } else {
        setToast({ type: "error", message: res.data?.error || "เกิดข้อผิดพลาด" });
      }
    } catch (e) {
      setToast({ type: "error", message: "เกิดข้อผิดพลาด: " + (e.message || "") });
    }
    setActionLoading(null);
  };

  const handleStartJob = () => {
    if (!eventDate) {
      setToast({ type: "error", message: "กรุณาเลือกวันที่จัดงาน" });
      return;
    }
    doAction("start_job", { event_date: eventDate });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const isAiActive = customer?.ai_active;
  const hasJob = !!customer?.event_date;
  const hasTimer = customer?.manual_chat_until && new Date(customer.manual_chat_until) > new Date();

  // Format timer remaining
  const getTimerText = () => {
    if (!hasTimer) return "";
    const diff = new Date(customer.manual_chat_until).getTime() - Date.now();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days} วัน ${hours} ชม.`;
    if (hours > 0) return `${hours} ชม. ${mins} นาที`;
    return `${mins} นาที`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            {customer.picture_url ? (
              <img src={customer.picture_url} className="w-12 h-12 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500">
                {(customer.display_name || "?").charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 truncate">
                {customer.display_name || "ไม่ทราบชื่อ"}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isAiActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  AI {isAiActive ? "เปิด" : "ปิด"}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {STATUS_LABEL[customer.status] || customer.status}
                </span>
              </div>
            </div>
          </div>
          {customer.event_date && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span>วันจัดงาน: <strong>{customer.event_date}</strong></span>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.message}
          </div>
        )}

        {/* เริ่มงาน/จอง */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-500" />
            เริ่มงาน / จอง
          </h3>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">เลือกวันที่จัดงาน</label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <button
            onClick={handleStartJob}
            disabled={actionLoading === "start_job"}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {actionLoading === "start_job" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            เริ่มงาน / จอง (Mute AI อัตโนมัติ)
          </button>
        </div>

        {/* ยกเลิกงาน */}
        {hasJob && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <button
              onClick={() => doAction("cancel_job")}
              disabled={actionLoading === "cancel_job"}
              className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-semibold text-sm border border-red-200 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === "cancel_job" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              ยกเลิกงาน (Unmute AI อัตโนมัติ)
            </button>
          </div>
        )}

        {/* ปลุกบอททันที (Manual Resume) */}
        {hasTimer && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-purple-200">
            <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg mb-3">
              <Timer className="w-4 h-4 shrink-0" />
              <span>Manual Chat Timer เหลือ: <strong>{getTimerText()}</strong></span>
            </div>
            <button
              onClick={() => doAction("resume_bot")}
              disabled={actionLoading === "resume_bot"}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === "resume_bot" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              ปลุกบอททันที (ล้าง Timer)
            </button>
          </div>
        )}

        {/* Mute / Unmute Manual */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            {isAiActive ? <Bot className="w-5 h-5 text-green-500" /> : <BotOff className="w-5 h-5 text-red-500" />}
            สั่ง AI แบบ Manual
          </h3>
          {isAiActive ? (
            <button
              onClick={() => doAction("mute")}
              disabled={actionLoading === "mute"}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === "mute" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BotOff className="w-4 h-4" />}
              Mute AI (ปิดบอท)
            </button>
          ) : (
            <button
              onClick={() => doAction("unmute")}
              disabled={actionLoading === "unmute"}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === "unmute" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              Unmute AI (เปิดบอท)
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-2">
          LIFF Admin Panel • {customer.line_user_id?.slice(0, 10)}...
        </div>
      </div>
    </div>
  );
}