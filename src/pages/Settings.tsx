import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Bot, Clock, MessageCircle, Trash2, AlertTriangle, Power, CalendarClock, FlaskConical, PowerOff, Sparkles, Bell, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNotificationSettings, type SoundType } from "@/hooks/useNotificationSound";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAutoSaveDraft, readDraft, clearDraft } from "@/hooks/useDraft";
import DraftBanner, { DraftSavedIndicator } from "@/components/knowledge/DraftBanner";


const DRAFT_KEY = "settings:main";

type BotMode = "full" | "scheduled" | "whitelist" | "off";

type Settings = {
  id?: string;
  bot_mode: BotMode;
  ai_enabled: boolean;
  ai_whitelist_enabled: boolean;
  ai_whitelist_user_ids: string[];
  schedule_enabled: boolean;
  start_time: string;
  end_time: string;
  cooldown_minutes: number;
  manual_chat_hours: number;
  phone_mute_hours: number;
  post_phone_max_replies: number;
  fallback_mute_hours: number;
  followup_hours: number;
  followup_enabled: boolean;
  sla_hours: number;
  debounce_seconds: number;
  out_of_hours_message: string;
  out_of_hours_message_enabled: boolean;
  unable_to_reply_message: string;
  unable_to_reply_enabled: boolean;
  followup_instruction: string;
  schedule_days: number[];
};

const DAY_LABELS = ["อา","จ","อ","พ","พฤ","ศ","ส"]; // 0=Sun..6=Sat
const DAY_FULL = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];

const MODES: { value: BotMode; label: string; desc: string; icon: any; color: string; combinable?: boolean }[] = [
  { value: "full", label: "เปิดเต็ม", desc: "บอทตอบลูกค้าทุกคน 24 ชม.", icon: Power, color: "text-green-600 bg-green-500/10 border-green-500/40" },
  { value: "scheduled", label: "ตามเวลา", desc: "บอทตอบเฉพาะช่วงเวลาที่กำหนด", icon: CalendarClock, color: "text-blue-600 bg-blue-500/10 border-blue-500/40", combinable: true },
  { value: "whitelist", label: "ทดสอบ", desc: "บอทตอบเฉพาะ LINE user ID ที่อนุญาต (เปิดร่วมกับ 'ตามเวลา' ได้ — ทีมทดสอบจะตอบได้ทุกเวลา)", icon: FlaskConical, color: "text-amber-600 bg-amber-500/10 border-amber-500/40", combinable: true },
  { value: "off", label: "ปิด", desc: "บอทไม่ตอบเลย ให้คนตอบเอง", icon: PowerOff, color: "text-rose-600 bg-rose-500/10 border-rose-500/40" },
];

// คำนวณโหมดจาก flags (source of truth) — รองรับ scheduled+whitelist พร้อมกัน
function deriveActive(s: { bot_mode: BotMode; schedule_enabled: boolean; ai_whitelist_enabled: boolean; ai_enabled: boolean }): Set<BotMode> {
  const set = new Set<BotMode>();
  if (!s.ai_enabled) { set.add("off"); return set; }
  if (s.schedule_enabled) set.add("scheduled");
  if (s.ai_whitelist_enabled) set.add("whitelist");
  if (set.size === 0) set.add("full");
  return set;
}

export default function Settings() {
  const { role } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [initialJSON, setInitialJSON] = useState<string>("");
  const [foundDraft, setFoundDraft] = useState<{ value: Settings; savedAt: number } | null>(null);
  const isDirty = !!s && JSON.stringify(s) !== initialJSON;
  const { savedAt, clear: clearDraftState } = useAutoSaveDraft<Settings>(DRAFT_KEY, s as Settings, !!s, { isDirty });

  const restoreDraft = () => { if (foundDraft) { setS(foundDraft.value); setFoundDraft(null); toast.success("กู้คืนฉบับร่างแล้ว"); } };
  const discardDraft = () => { clearDraft(DRAFT_KEY); clearDraftState(); setFoundDraft(null); toast("ทิ้งฉบับร่างแล้ว"); };


  const clearTestData = async (mode: "conversations" | "all") => {
    setClearing(true);
    try {
      const { error: convErr } = await supabase.from("conversations").delete().not("id", "is", null);
      if (convErr) throw convErr;
      if (mode === "all") {
        const { error: custErr } = await supabase.from("customers").delete().not("id", "is", null);
        if (custErr) throw custErr;
      } else {
        const { error: resetErr } = await supabase.from("customers").update({
          event_type: null, guest_count: null, venue: null, event_month: null, event_date: null,
          last_sent_image_titles: [], conversation_summary: null, summary_until_message_id: null,
          last_message_snippet: null, last_message_at: null, unread_count: 0,
        }).not("id", "is", null);
        if (resetErr) throw resetErr;
      }
      toast.success(mode === "all" ? "ลบแชท + ลูกค้าทั้งหมดแล้ว" : "ลบประวัติแชท + ล้าง context AI แล้ว");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    supabase.from("app_settings").select("*").eq("key", "ai_config").maybeSingle()
      .then(({ data }) => {
        setS(data as any);
        setInitialJSON(JSON.stringify(data ?? {}));
        const d = readDraft<Settings>(DRAFT_KEY);
        if (d && JSON.stringify(d.value) !== JSON.stringify(data ?? {})) setFoundDraft(d);
        else if (d) clearDraft(DRAFT_KEY);
        setLoading(false);
      });
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    // bot_mode เก็บเป็น display label สำหรับ backward compat — แต่ webhook ใช้ flag ตรง ๆ
    const displayMode: BotMode =
      !s.ai_enabled ? "off"
      : (s.schedule_enabled || s.ai_whitelist_enabled) ? (s.schedule_enabled ? "scheduled" : "whitelist")
      : "full";
    const { error } = await supabase.from("app_settings").update({
      bot_mode: displayMode,
      ai_enabled: s.ai_enabled,
      schedule_enabled: s.schedule_enabled,
      ai_whitelist_enabled: s.ai_whitelist_enabled,
      ai_whitelist_user_ids: s.ai_whitelist_user_ids,
      cooldown_minutes: s.cooldown_minutes,
      manual_chat_hours: s.manual_chat_hours,
      phone_mute_hours: s.phone_mute_hours,
      post_phone_max_replies: s.post_phone_max_replies,
      fallback_mute_hours: s.fallback_mute_hours,
      followup_hours: s.followup_hours,
      followup_enabled: s.followup_enabled,
      start_time: s.start_time,
      end_time: s.end_time,
      schedule_days: s.schedule_days ?? [0,1,2,3,4,5,6],
      sla_hours: s.sla_hours,
      debounce_seconds: s.debounce_seconds,
      out_of_hours_message: s.out_of_hours_message,
      out_of_hours_message_enabled: s.out_of_hours_message_enabled,
      unable_to_reply_message: s.unable_to_reply_message,
      unable_to_reply_enabled: s.unable_to_reply_enabled,
      followup_instruction: s.followup_instruction,
    }).eq("key", "ai_config");
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกการตั้งค่าแล้ว");
    setInitialJSON(JSON.stringify(s));
    clearDraft(DRAFT_KEY);
    clearDraftState();
  };

  const upd = (k: keyof Settings, v: any) => setS(prev => prev ? { ...prev, [k]: v } : prev);

  // คลิกการ์ดโหมด — full/off = exclusive, scheduled/whitelist = toggle ติ๊กพร้อมกันได้
  const toggleMode = (mode: BotMode) => {
    setS(prev => {
      if (!prev) return prev;
      if (mode === "off") {
        return { ...prev, ai_enabled: false, schedule_enabled: false, ai_whitelist_enabled: false };
      }
      if (mode === "full") {
        return { ...prev, ai_enabled: true, schedule_enabled: false, ai_whitelist_enabled: false };
      }
      const next = { ...prev, ai_enabled: true };
      if (mode === "scheduled") next.schedule_enabled = !prev.schedule_enabled;
      if (mode === "whitelist") next.ai_whitelist_enabled = !prev.ai_whitelist_enabled;
      return next;
    });
  };

  if (loading || !s) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  const activeModes = deriveActive(s);
  const isActive = (v: BotMode) => activeModes.has(v);
  const bannerLabel =
    isActive("off") ? "ปิด"
    : isActive("scheduled") && isActive("whitelist") ? "ตามเวลา + ทดสอบ"
    : isActive("scheduled") ? "ตามเวลา"
    : isActive("whitelist") ? "ทดสอบ"
    : "เปิดเต็ม";
  const bannerDesc =
    isActive("off") ? "บอทไม่ตอบเลย"
    : isActive("scheduled") && isActive("whitelist") ? "ลูกค้าทั่วไป: ตอบเฉพาะในเวลาทำการ • ทีมทดสอบ (whitelist): ตอบได้ทุกเวลา"
    : isActive("scheduled") ? "บอทตอบเฉพาะช่วงเวลาที่กำหนด"
    : isActive("whitelist") ? "บอทตอบเฉพาะ LINE user ID ที่อนุญาต"
    : "บอทตอบลูกค้าทุกคน 24 ชม.";
  const bannerColor =
    isActive("off") ? "text-rose-600 bg-rose-500/10 border-rose-500/40"
    : (isActive("scheduled") || isActive("whitelist")) ? "text-blue-600 bg-blue-500/10 border-blue-500/40"
    : "text-green-600 bg-green-500/10 border-green-500/40";
  const BannerIcon =
    isActive("off") ? PowerOff
    : isActive("scheduled") && isActive("whitelist") ? FlaskConical
    : isActive("scheduled") ? CalendarClock
    : isActive("whitelist") ? FlaskConical
    : Power;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">ตั้งค่าระบบ</h1>
          <p className="text-muted-foreground mt-1">ปรับโหมดการทำงานของบอท และข้อความตอบกลับอัตโนมัติ</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={save} disabled={saving} size="lg">
            {saving ? <Loader2 className="animate-spin"/> : <Save />} บันทึก
          </Button>
          <DraftSavedIndicator savedAt={savedAt} />
        </div>
      </div>

      {foundDraft && <DraftBanner savedAt={foundDraft.savedAt} onRestore={restoreDraft} onDiscard={discardDraft} />}



      {/* Current status banner */}
      <Card className={`p-5 border-2 ${bannerColor}`}>
        <div className="flex items-center gap-3">
          <BannerIcon className="w-7 h-7" />
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">สถานะปัจจุบัน</div>
            <div className="font-display text-xl font-semibold">โหมด: {bannerLabel}</div>
            <div className="text-sm opacity-80 mt-0.5">{bannerDesc}</div>
          </div>
        </div>
      </Card>

      {/* Mode selector */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-1"><Bot className="text-primary"/><h2 className="font-display text-lg font-semibold">โหมดการทำงานของบอท</h2></div>
        <p className="text-xs text-muted-foreground mb-4">"ตามเวลา" และ "ทดสอบ" เปิดพร้อมกันได้ — ทีมทดสอบจะตอบได้ทุกเวลา ลูกค้าทั่วไปยังจำกัดตามเวลาทำการ</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {MODES.map(m => {
            const active = isActive(m.value);
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => toggleMode(m.value)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${active ? m.color + " shadow-md" : "border-border/60 bg-card hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{m.label}</span>
                  {m.combinable && <span className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10 uppercase tracking-wide">รวมได้</span>}
                  {active && <span className="ml-auto text-[10px] uppercase font-semibold opacity-70">เปิดอยู่</span>}
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Mode-specific config */}
        {isActive("scheduled") && (
          <div className="mt-5 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-4">
            <div className="space-y-3">
              <Label className="font-medium flex items-center gap-2"><Clock className="w-4 h-4"/> ช่วงเวลาที่บอททำงาน</Label>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">บอทเริ่มตอบ</Label><Input type="time" value={s.start_time} onChange={e=>upd("start_time", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">บอทหยุดตอบ</Label><Input type="time" value={s.end_time} onChange={e=>upd("end_time", e.target.value)} /></div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-medium flex items-center gap-2"><CalendarClock className="w-4 h-4"/> วันที่บอททำงาน</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((lbl, i) => {
                  const days = s.schedule_days ?? [0,1,2,3,4,5,6];
                  const on = days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      title={DAY_FULL[i]}
                      onClick={() => {
                        const next = on ? days.filter(d => d !== i) : [...days, i].sort();
                        upd("schedule_days", next);
                      }}
                      className={`w-10 h-10 rounded-lg border-2 text-sm font-medium transition-all ${on ? "border-blue-500 bg-blue-500 text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:border-blue-500/40"}`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 text-[11px]">
                <button type="button" className="text-blue-600 hover:underline" onClick={()=>upd("schedule_days",[0,1,2,3,4,5,6])}>เลือกทุกวัน</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-blue-600 hover:underline" onClick={()=>upd("schedule_days",[1,2,3,4,5])}>เฉพาะวันธรรมดา</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-blue-600 hover:underline" onClick={()=>upd("schedule_days",[0,6])}>เฉพาะวันหยุด</button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">นอกช่วงเวลา/วันที่กำหนด บอทจะเงียบสำหรับลูกค้าทั่วไป (ถ้าเปิด "ทดสอบ" ร่วม คนใน whitelist จะตอบได้ทุกเวลา)</p>
          </div>
        )}

        {isActive("whitelist") && (
          <div className="mt-5 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
            <Label className="font-medium">LINE user ID ที่อนุญาต (หนึ่ง ID ต่อบรรทัด)</Label>
            <Textarea
              rows={5}
              className="font-mono text-xs"
              placeholder={"Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nUyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"}
              value={(s.ai_whitelist_user_ids ?? []).join("\n")}
              onChange={e=>upd("ai_whitelist_user_ids", e.target.value.split("\n").map(x=>x.trim()).filter(Boolean))}
            />
            <p className="text-[11px] text-muted-foreground">ID เริ่มต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว — คนใน list นี้บอทจะตอบเสมอ ไม่สนใจ schedule</p>
          </div>
        )}
      </Card>


      {/* Auto reply messages */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-1"><Sparkles className="text-primary"/><h2 className="font-display text-lg font-semibold">ข้อความตอบกลับอัตโนมัติ</h2></div>
        <p className="text-xs text-muted-foreground mb-5">ตั้งค่าข้อความที่บอทจะส่งให้ลูกค้าในแต่ละสถานการณ์ — เปิด/ปิดได้แยกอิสระ</p>

        <div className="space-y-4">
          {/* Out of hours */}
          <div className="p-4 rounded-lg border border-border/60 bg-muted/30 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="font-medium flex items-center gap-2">🕐 เมื่อลูกค้าทักนอกเวลาทำการ</Label>
                <p className="text-xs text-muted-foreground mt-1">ทำงานเฉพาะเมื่ออยู่ในโหมด "ตามเวลา" — ถ้าปิดสวิตช์ บอทจะเงียบสนิท (ไม่แจ้งลูกค้า)</p>
              </div>
              <Switch checked={s.out_of_hours_message_enabled} onCheckedChange={v=>upd("out_of_hours_message_enabled", v)} />
            </div>
            {s.out_of_hours_message_enabled && (
              <>
                <Textarea rows={3} value={s.out_of_hours_message} onChange={e=>upd("out_of_hours_message", e.target.value)} placeholder="เช่น ขอบคุณที่ติดต่อมาค่ะ ขณะนี้อยู่นอกเวลาทำการ..." />
                <div className="text-[11px] text-muted-foreground bg-background/60 rounded p-2 border border-border/40">
                  <span className="font-medium">ตัวอย่างที่ลูกค้าจะเห็น:</span> {s.out_of_hours_message || <em className="opacity-50">(ว่าง)</em>}
                </div>
              </>
            )}
          </div>

          {/* Unable to reply */}
          <div className="p-4 rounded-lg border border-border/60 bg-muted/30 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="font-medium flex items-center gap-2">🤖 เมื่อ AI ตอบไม่ได้ / ส่งต่อผู้เชี่ยวชาญ</Label>
                <p className="text-xs text-muted-foreground mt-1">ทำงานเมื่อ AI พังหรือตอบไม่ออก — ปิดสวิตช์ = เงียบ (ไม่แนะนำ ลูกค้าจะไม่รู้ว่าเกิดอะไรขึ้น)</p>
              </div>
              <Switch checked={s.unable_to_reply_enabled} onCheckedChange={v=>upd("unable_to_reply_enabled", v)} />
            </div>
            {s.unable_to_reply_enabled && (
              <>
                <Textarea rows={3} value={s.unable_to_reply_message} onChange={e=>upd("unable_to_reply_message", e.target.value)} placeholder="เช่น ขอบคุณที่สอบถามนะคะ ขอส่งเรื่องให้เจ้าหน้าที่ผู้เชี่ยวชาญ..." />
                <div className="text-[11px] text-muted-foreground bg-background/60 rounded p-2 border border-border/40">
                  <span className="font-medium">ตัวอย่างที่ลูกค้าจะเห็น:</span> {s.unable_to_reply_message || <em className="opacity-50">(ว่าง)</em>}
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5 pt-2">
            <Label>หยุด AI หลังส่งข้อความ Fallback (ชม.)</Label>
            <Input type="number" min={0} step={0.5} value={s.fallback_mute_hours} onChange={e=>upd("fallback_mute_hours", +e.target.value)} />
            <p className="text-xs text-muted-foreground">หลังส่งข้อความข้างบนแล้ว AI จะหยุดตอบลูกค้าคนนี้กี่ชั่วโมง (รอแอดมินมาดูแล)</p>
          </div>
        </div>
      </Card>

      {/* Timing */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Clock className="text-primary"/><h2 className="font-display text-lg font-semibold">เวลา & การหยุด AI</h2></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>รอลูกค้าพิมพ์เสร็จก่อนตอบ (วิ)</Label><Input type="number" min={0} max={120} value={s.debounce_seconds ?? 8} onChange={e=>upd("debounce_seconds", +e.target.value)} /><p className="text-[11px] text-muted-foreground">ลูกค้าพิมพ์หลายข้อความติดกัน AI รอแล้วตอบรวมทีเดียว</p></div>
          <div className="space-y-1.5"><Label>Cooldown ระหว่างข้อความ AI (นาที)</Label><Input type="number" value={s.cooldown_minutes} onChange={e=>upd("cooldown_minutes", +e.target.value)} /></div>
          <div className="space-y-1.5"><Label>หยุด AI เมื่อแอดมินตอบ (ชม.)</Label><Input type="number" value={s.manual_chat_hours} onChange={e=>upd("manual_chat_hours", +e.target.value)} /></div>
          <div className="space-y-1.5"><Label>หยุด AI หลังได้เบอร์ (ชม.)</Label><Input type="number" value={s.phone_mute_hours} onChange={e=>upd("phone_mute_hours", +e.target.value)} /></div>
          <div className="space-y-1.5"><Label>AI ตอบกี่รอบหลังลูกค้าให้เบอร์</Label><Input type="number" min={0} value={s.post_phone_max_replies} onChange={e=>upd("post_phone_max_replies", +e.target.value)} /><p className="text-[11px] text-muted-foreground">0 = ปิดทันที (default 3)</p></div>
          <div className="space-y-1.5"><Label>SLA (ชม.)</Label><Input type="number" value={s.sla_hours} onChange={e=>upd("sla_hours", +e.target.value)} /></div>
        </div>
      </Card>

      {/* Follow-up */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><MessageCircle className="text-primary"/><h2 className="font-display text-lg font-semibold">Follow-up อัตโนมัติ</h2></div>
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-4">
          <div><Label className="font-medium">เปิดใช้งาน Follow-up</Label><p className="text-xs text-muted-foreground mt-1">ติดตามลูกค้าที่ไม่ตอบกลับ</p></div>
          <Switch checked={s.followup_enabled} onCheckedChange={v=>upd("followup_enabled", v)} />
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>ติดตามหลังเงียบ (ชม.)</Label><Input type="number" value={s.followup_hours} onChange={e=>upd("followup_hours", +e.target.value)} /></div>

          <div className="space-y-1.5">
            <Label>แนวทางให้ AI เขียนข้อความติดตาม</Label>
            <Textarea
              rows={5}
              value={s.followup_instruction ?? ""}
              onChange={e=>upd("followup_instruction", e.target.value)}
              placeholder="เช่น ทักลูกค้าแบบสุภาพ สั้น อ้างอิงสิ่งที่คุยไว้ (วันจัดงาน/ประเภทงาน) สอบถามว่ายังสนใจไหมและขอเบอร์ ห้ามตื๊อ"
            />
            <p className="text-xs text-muted-foreground">AI จะใช้แนวทางนี้ + ประวัติแชท + ข้อมูลลูกค้า สร้างข้อความติดตามแบบเฉพาะคน (ไม่ใช่ template ตายตัว) — ต่างจาก Fallback ตรงที่ตัวนี้ AI เขียนเองตามบริบท</p>
          </div>
        </div>
      </Card>

      {/* Notification sound */}
      <NotificationSoundCard />





      {/* Linked pages */}
      <Card className="p-6 shadow-soft border-border/60 bg-primary/5">
        <h2 className="font-display text-lg font-semibold mb-3">การตั้งค่าอื่นๆ</h2>
        <div className="space-y-2 text-sm">
          <a href="/ai-settings" className="block text-primary hover:underline">→ บทบาท AI / สรรพนาม / สไตล์การตอบ / กลยุทธ์ส่งรูป (หน้า "ตั้งค่า AI")</a>
          <a href="/knowledge" className="block text-primary hover:underline">→ กฎ AI (วิธีคุย/ห้าม/ต้อง) — แท็บ "กฎ AI" ในหน้าสอน AI</a>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 shadow-soft border-destructive/40 bg-destructive/5">
        <div className="flex items-center gap-2 mb-2"><AlertTriangle className="text-destructive"/><h2 className="font-display text-lg font-semibold">โซนทดสอบ (Danger Zone)</h2></div>
        <p className="text-sm text-muted-foreground mb-4">ใช้ระหว่างเทสระบบ — ลบข้อมูลแล้วเรียกคืนไม่ได้</p>
        <div className="flex flex-wrap gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={clearing}><Trash2 className="w-4 h-4"/> ล้างประวัติแชท</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ล้างประวัติแชททั้งหมด?</AlertDialogTitle>
                <AlertDialogDescription>ลบข้อความทุกบทสนทนา แต่ลูกค้ายังอยู่ (สถานะ/เบอร์โทรไม่ถูกลบ)</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearTestData("conversations")}>ล้างแชท</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={clearing}><Trash2 className="w-4 h-4"/> ล้างทั้งหมด (แชท + ลูกค้า)</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ล้างข้อมูลทดสอบทั้งหมด?</AlertDialogTitle>
                <AlertDialogDescription>ลบลูกค้าทุกคน + ประวัติแชทเพื่อเริ่มเทสใหม่ ลูกค้าจะถูกสร้างใหม่อัตโนมัติเมื่อทักเข้ามา</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearTestData("all")} className="bg-destructive hover:bg-destructive/90">ล้างทั้งหมด</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  );
}

const SOUND_OPTIONS: { value: SoundType; label: string; desc: string }[] = [
  { value: "ding", label: "Ding", desc: "เสียงระฆังสั้นๆ" },
  { value: "chime", label: "Chime", desc: "เสียงระฆังสองโน้ต" },
  { value: "pop", label: "Pop", desc: "เสียงเด้งสั้นๆ" },
];

function NotificationSoundCard() {
  const { settings, update, test } = useNotificationSettings();
  return (
    <Card className="p-6 shadow-soft border-border/60">
      <div className="flex items-center gap-2 mb-1"><Bell className="text-primary"/><h2 className="font-display text-lg font-semibold">เสียงแจ้งเตือนแชท</h2></div>
      <p className="text-xs text-muted-foreground mb-5">เล่นเสียงเมื่อมีลูกค้าทักเข้ามาใหม่ (ตั้งค่าเฉพาะเบราว์เซอร์นี้) — ครั้งแรกอาจต้องคลิกที่หน้าเว็บก่อน 1 ครั้งให้เบราว์เซอร์อนุญาตเล่นเสียง</p>

      <div className="space-y-5">
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
          <div>
            <Label className="font-medium">เปิดเสียงแจ้งเตือน</Label>
            <p className="text-xs text-muted-foreground mt-1">ไม่เล่นเสียงตอนกำลังเปิดแชทคนนั้นอยู่</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={v => update({ enabled: v })} />
        </div>

        {settings.enabled && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>เลือกเสียง</Label>
                <Select value={settings.sound} onValueChange={(v: SoundType) => update({ sound: v })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {SOUND_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{o.label}</span>
                          <span className="text-[11px] text-muted-foreground">{o.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Volume2 className="w-4 h-4"/> ระดับเสียง ({Math.round(settings.volume * 100)}%)</Label>
                <Slider
                  value={[Math.round(settings.volume * 100)]}
                  min={0} max={100} step={5}
                  onValueChange={([v]) => update({ volume: v / 100 })}
                />
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={test}>
              <Volume2 className="w-4 h-4"/> ทดสอบเสียง
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

