import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Bot, Clock, Shield, MessageCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  id?: string;
  ai_enabled: boolean;
  confidence_threshold: number;
  cooldown_minutes: number;
  manual_chat_hours: number;
  phone_mute_hours: number;
  fallback_mute_hours: number;
  followup_hours: number;
  followup_enabled: boolean;
  schedule_enabled: boolean;
  start_time: string;
  end_time: string;
  strict_rules: string[];
  sla_hours: number;
  fallback_message: string;
};

export default function Settings() {
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState("");

  useEffect(() => {
    supabase.from("app_settings").select("*").eq("key", "ai_config").maybeSingle()
      .then(({ data }) => { setS(data as any); setLoading(false); });
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({
      ai_enabled: s.ai_enabled, confidence_threshold: s.confidence_threshold, cooldown_minutes: s.cooldown_minutes,
      manual_chat_hours: s.manual_chat_hours, phone_mute_hours: s.phone_mute_hours, fallback_mute_hours: s.fallback_mute_hours,
      followup_hours: s.followup_hours, followup_enabled: s.followup_enabled, schedule_enabled: s.schedule_enabled,
      start_time: s.start_time, end_time: s.end_time, strict_rules: s.strict_rules, sla_hours: s.sla_hours, fallback_message: s.fallback_message,
    }).eq("key", "ai_config");
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const upd = (k: keyof Settings, v: any) => setS(prev => prev ? { ...prev, [k]: v } : prev);

  if (loading || !s) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">ตั้งค่าระบบ</h1>
          <p className="text-muted-foreground mt-1">ปรับพฤติกรรม AI และระบบ Manual Chat</p>
        </div>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="animate-spin"/> : <Save />} บันทึก
        </Button>
      </div>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Bot className="text-primary"/><h2 className="font-display text-lg font-semibold">การทำงานของ AI</h2></div>
        <div className="space-y-5">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div><Label className="font-medium">เปิดใช้งาน AI</Label><p className="text-xs text-muted-foreground mt-1">ให้ AI ตอบลูกค้าอัตโนมัติ</p></div>
            <Switch checked={s.ai_enabled} onCheckedChange={v=>upd("ai_enabled",v)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Confidence Threshold (%)</Label><Input type="number" value={s.confidence_threshold} onChange={e=>upd("confidence_threshold",+e.target.value)} /><p className="text-xs text-muted-foreground">ต่ำกว่าค่านี้จะส่ง Fallback</p></div>
            <div className="space-y-1.5"><Label>Cooldown (นาที)</Label><Input type="number" value={s.cooldown_minutes} onChange={e=>upd("cooldown_minutes",+e.target.value)} /><p className="text-xs text-muted-foreground">เว้นช่วงระหว่างข้อความ AI</p></div>
          </div>
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Clock className="text-primary"/><h2 className="font-display text-lg font-semibold">Manual Chat & Mute Timer</h2></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Manual Chat (ชม.)</Label><Input type="number" value={s.manual_chat_hours} onChange={e=>upd("manual_chat_hours",+e.target.value)} /><p className="text-xs text-muted-foreground">หยุด AI เมื่อแอดมินตอบ</p></div>
          <div className="space-y-1.5"><Label>หยุด AI หลังได้เบอร์ (ชม.)</Label><Input type="number" value={s.phone_mute_hours} onChange={e=>upd("phone_mute_hours",+e.target.value)} /></div>
          <div className="space-y-1.5"><Label>หยุด AI หลัง Fallback (ชม.)</Label><Input type="number" value={s.fallback_mute_hours} onChange={e=>upd("fallback_mute_hours",+e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SLA (ชม.)</Label><Input type="number" value={s.sla_hours} onChange={e=>upd("sla_hours",+e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><MessageCircle className="text-primary"/><h2 className="font-display text-lg font-semibold">Follow-up อัตโนมัติ</h2></div>
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-4">
          <div><Label className="font-medium">เปิดใช้งาน Follow-up</Label><p className="text-xs text-muted-foreground mt-1">ติดตามลูกค้าที่ไม่ตอบกลับ</p></div>
          <Switch checked={s.followup_enabled} onCheckedChange={v=>upd("followup_enabled",v)} />
        </div>
        <div className="space-y-1.5"><Label>ติดตามหลังเงียบ (ชม.)</Label><Input type="number" value={s.followup_hours} onChange={e=>upd("followup_hours",+e.target.value)} /></div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Clock className="text-primary"/><h2 className="font-display text-lg font-semibold">เวลาทำการ</h2></div>
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-4">
          <Label className="font-medium">เปิดเฉพาะนอกเวลา</Label>
          <Switch checked={s.schedule_enabled} onCheckedChange={v=>upd("schedule_enabled",v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>เริ่ม</Label><Input type="time" value={s.start_time} onChange={e=>upd("start_time",e.target.value)} /></div>
          <div className="space-y-1.5"><Label>สิ้นสุด</Label><Input type="time" value={s.end_time} onChange={e=>upd("end_time",e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Shield className="text-primary"/><h2 className="font-display text-lg font-semibold">กฎเข้มงวดของ AI</h2></div>
        <div className="flex gap-2 mb-3">
          <Input value={newRule} onChange={e=>setNewRule(e.target.value)} placeholder="เพิ่มกฎ เช่น: ห้ามเสนอราคาส่วนลดเกิน 10%" onKeyDown={e=>{if(e.key==="Enter"&&newRule.trim()){upd("strict_rules",[...s.strict_rules,newRule.trim()]);setNewRule("");}}} />
          <Button variant="outline" onClick={()=>{if(newRule.trim()){upd("strict_rules",[...s.strict_rules,newRule.trim()]);setNewRule("");}}}><Plus/></Button>
        </div>
        <div className="space-y-2">
          {s.strict_rules.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีกฎ</p>}
          {s.strict_rules.map((r,i)=>(
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <span className="text-sm">{r}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>upd("strict_rules",s.strict_rules.filter((_,j)=>j!==i))}><X className="w-4 h-4"/></Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <h2 className="font-display text-lg font-semibold mb-4">ข้อความ Fallback</h2>
        <Textarea value={s.fallback_message} onChange={e=>upd("fallback_message",e.target.value)} rows={4} />
        <p className="text-xs text-muted-foreground mt-2">ข้อความที่ส่งเมื่อ AI ตอบไม่ได้ หรือนอกเวลาทำการ</p>
      </Card>
    </div>
  );
}
