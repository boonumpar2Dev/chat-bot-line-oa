import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Bot, Clock, MessageCircle, Trash2, AlertTriangle, Power, CalendarClock, FlaskConical, PowerOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
};

const MODES: { value: BotMode; label: string; desc: string; icon: any; color: string }[] = [
  { value: "full", label: "เปิดเต็ม", desc: "บอทตอบลูกค้าทุกคน 24 ชม.", icon: Power, color: "text-green-600 bg-green-500/10 border-green-500/40" },
  { value: "scheduled", label: "ตามเวลา", desc: "บอทตอบเฉพาะช่วงเวลาที่กำหนด", icon: CalendarClock, color: "text-blue-600 bg-blue-500/10 border-blue-500/40" },
  { value: "whitelist", label: "ทดสอบ", desc: "บอทตอบเฉพาะ LINE user ID ที่อนุญาต", icon: FlaskConical, color: "text-amber-600 bg-amber-500/10 border-amber-500/40" },
  { value: "off", label: "ปิด", desc: "บอทไม่ตอบเลย ให้คนตอบเอง", icon: PowerOff, color: "text-rose-600 bg-rose-500/10 border-rose-500/40" },
];

export default function Settings() {
  const { role } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

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
      .then(({ data }) => { setS(data as any); setLoading(false); });
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    // Derive flag เดิมจาก bot_mode (เพื่อ backward compat กับ webhook)
    const derived = {
      ai_enabled: s.bot_mode !== "off",
      schedule_enabled: s.bot_mode === "scheduled",
      ai_whitelist_enabled: s.bot_mode === "whitelist",
    };
    const { error } = await supabase.from("app_settings").update({
      bot_mode: s.bot_mode,
      ...derived,
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
      sla_hours: s.sla_hours,
      debounce_seconds: s.debounce_seconds,
      out_of_hours_message: s.out_of_hours_message,
      out_of_hours_message_enabled: s.out_of_hours_message_enabled,
      unable_to_reply_message: s.unable_to_reply_message,
      unable_to_reply_enabled: s.unable_to_reply_enabled,
    }).eq("key", "ai_config");
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const upd = (k: keyof Settings, v: any) => setS(prev => prev ? { ...prev, [k]: v } : prev);

  if (loading || !s) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  const currentMode = MODES.find(m => m.value === s.bot_mode) ?? MODES[0];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">ตั้งค่าระบบ</h1>
          <p className="text-muted-foreground mt-1">ปรับโหมดการทำงานของบอท และข้อความตอบกลับอัตโนมัติ</p>
        </div>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="animate-spin"/> : <Save />} บันทึก
        </Button>
      </div>

      {/* Current status banner */}
      <Card className={`p-5 border-2 ${currentMode.color}`}>
        <div className="flex items-center gap-3">
          <currentMode.icon className="w-7 h-7" />
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">สถานะปัจจุบัน</div>
            <div className="font-display text-xl font-semibold">โหมด: {currentMode.label}</div>
            <div className="text-sm opacity-80 mt-0.5">{currentMode.desc}</div>
          </div>
        </div>
      </Card>

      {/* Mode selector */}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-4"><Bot className="text-primary"/><h2 className="font-display text-lg font-semibold">โหมดการทำงานของบอท</h2></div>
        <div className="grid sm:grid-cols-2 gap-3">
          {MODES.map(m => {
            const active = s.bot_mode === m.value;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => upd("bot_mode", m.value)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${active ? m.color + " shadow-md" : "border-border/60 bg-card hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{m.label}</span>
                  {active && <span className="ml-auto text-[10px] uppercase font-semibold opacity-70">เลือกอยู่</span>}
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Mode-specific config */}
        {s.bot_mode === "scheduled" && (
          <div className="mt-5 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-3">
            <Label className="font-medium flex items-center gap-2"><Clock className="w-4 h-4"/> ช่วงเวลาที่บอททำงาน</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">บอทเริ่มตอบ</Label><Input type="time" value={s.start_time} onChange={e=>upd("start_time", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">บอทหยุดตอบ</Label><Input type="time" value={s.end_time} onChange={e=>upd("end_time", e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">นอกเวลานี้ บอทจะเงียบ (หรือส่งข้อความ "นอกเวลาทำการ" ถ้าเปิดไว้ในการ์ดด้านล่าง)</p>
          </div>
        )}

        {s.bot_mode === "whitelist" && (
          <div className="mt-5 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
            <Label className="font-medium">LINE user ID ที่อนุญาต (หนึ่ง ID ต่อบรรทัด)</Label>
            <Textarea
              rows={5}
              className="font-mono text-xs"
              placeholder={"Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nUyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"}
              value={(s.ai_whitelist_user_ids ?? []).join("\n")}
              onChange={e=>upd("ai_whitelist_user_ids", e.target.value.split("\n").map(x=>x.trim()).filter(Boolean))}
            />
            <p className="text-[11px] text-muted-foreground">ID เริ่มต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว — หาได้จากหน้า Chats หรือตาราง customers</p>
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
        <div className="space-y-1.5"><Label>ติดตามหลังเงียบ (ชม.)</Label><Input type="number" value={s.followup_hours} onChange={e=>upd("followup_hours", +e.target.value)} /></div>
      </Card>

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
