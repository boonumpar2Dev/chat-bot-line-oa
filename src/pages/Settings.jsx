import { Bot, Clock, Bell, Shield, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const defaultConfig = {
  ai_enabled: true,
  confidence_threshold: 75,
  cooldown_minutes: 1,
  schedule_enabled: false,
  start_time: "18:00",
  end_time: "08:00",
  strict_rules: [
    "ห้ามเสนอส่วนลดหรือเงื่อนไขพิเศษนอกเหนือจาก Knowledge Base",
    "ห้าม AI แต่งเรื่องหรือสร้างข้อมูลเอง (Zero Hallucination)",
    "กรณีไม่มั่นใจ ต้อง Fallback ส่งต่อแอดมินทันที",
  ],
};

export default function Settings() {
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await base44.entities.AppSettings.filter({ key: "ai_config" });
    if (data && data.length > 0) {
      const s = data[0];
      setSettingId(s.id);
      setConfig({
        ai_enabled: s.ai_enabled ?? true,
        confidence_threshold: s.confidence_threshold ?? 75,
        cooldown_minutes: s.cooldown_minutes ?? 1,
        schedule_enabled: s.schedule_enabled ?? false,
        start_time: s.start_time ?? "18:00",
        end_time: s.end_time ?? "08:00",
        strict_rules: Array.isArray(s.strict_rules) && s.strict_rules.length > 0
          ? s.strict_rules
          : defaultConfig.strict_rules,
      });
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    if (settingId) {
      await base44.entities.AppSettings.update(settingId, { key: "ai_config", ...config });
    } else {
      const created = await base44.entities.AppSettings.create({ key: "ai_config", ...config });
      setSettingId(created.id);
    }
    toast.success("บันทึกสำเร็จ");
    setSaving(false);
  };

  const update = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">ตั้งค่า</h1>
          <p className="text-muted-foreground text-sm mt-1">ปรับแต่งการทำงานของ AI และระบบ</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 self-start sm:self-auto shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">บันทึก</span>
        </button>
      </div>

      <div className="stat-card space-y-5">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Bot className="w-5 h-5 text-green-600" /> การทำงานของ AI
        </h3>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-foreground">เปิดใช้งาน AI ตอบแชท</div>
            <div className="text-xs text-muted-foreground">AI จะตอบข้อความลูกค้าอัตโนมัติ</div>
          </div>
          <button
            onClick={() => update("ai_enabled", !config.ai_enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.ai_enabled ? "bg-green-500" : "bg-muted"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 transition-transform shadow-sm ${config.ai_enabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            ค่าความมั่นใจขั้นต่ำ (Confidence Threshold): {config.confidence_threshold}%
          </label>
          <input type="range" min="50" max="95" value={config.confidence_threshold}
            onChange={(e) => update("confidence_threshold", Number(e.target.value))}
            className="w-full accent-green-600" />
          <p className="text-xs text-muted-foreground">หาก Confidence ต่ำกว่า {config.confidence_threshold}% AI จะส่งต่อให้แอดมินทันที</p>
        </div>
      </div>

      <div className="stat-card space-y-5">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" /> การสลับแอดมิน (Handoff)
        </h3>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Cooldown Period: {config.cooldown_minutes} นาที</label>
          <input type="range" min="1" max="10" value={config.cooldown_minutes}
            onChange={(e) => update("cooldown_minutes", Number(e.target.value))}
            className="w-full accent-blue-500" />
          <p className="text-xs text-muted-foreground">AI จะรอ {config.cooldown_minutes} นาที หลังจากแอดมินส่งข้อความสุดท้าย ก่อนกลับมาทำงาน</p>
        </div>
      </div>

      <div className="stat-card space-y-5">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5 text-yellow-500" /> ตั้งเวลาทำงาน
        </h3>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-foreground">AI ทำงานเฉพาะนอกเวลาทำการ</div>
            <div className="text-xs text-muted-foreground">AI จะตอบแชทเฉพาะช่วงเวลาที่กำหนด</div>
          </div>
          <button
            onClick={() => update("schedule_enabled", !config.schedule_enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.schedule_enabled ? "bg-green-500" : "bg-muted"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 transition-transform shadow-sm ${config.schedule_enabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
        {config.schedule_enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">เริ่มเวลา</label>
              <input type="time" value={config.start_time} onChange={(e) => update("start_time", e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">สิ้นสุดเวลา</label>
              <input type="time" value={config.end_time} onChange={(e) => update("end_time", e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            </div>
          </div>
        )}
      </div>

      <div className="stat-card space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-500" /> กฎเข้มงวด (Strict Rules)
        </h3>
        <p className="text-xs text-muted-foreground">กฎเหล่านี้จะถูกส่งให้ AI ปฏิบัติตามทุกครั้งที่ตอบลูกค้า</p>
        <div className="space-y-2">
          {(config.strict_rules || []).map((rule, idx) => (
            <div key={idx} className="flex items-start gap-2 group">
              <span className="text-red-500 mt-2.5 shrink-0">•</span>
              <input
                type="text"
                value={rule}
                onChange={(e) => {
                  const updated = [...config.strict_rules];
                  updated[idx] = e.target.value;
                  update("strict_rules", updated);
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => {
                  const updated = config.strict_rules.filter((_, i) => i !== idx);
                  update("strict_rules", updated);
                }}
                className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="ลบกฎนี้"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => update("strict_rules", [...(config.strict_rules || []), ""])}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มกฎใหม่
        </button>
      </div>
    </div>
  );
}