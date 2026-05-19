import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, ALL_MENUS, MenuKey } from "@/hooks/useMenuPermissions";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Bot, Clock, Shield, MessageCircle, Plus, X, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
  debounce_seconds: number;
  comparison_phase_enabled: boolean;
  comparison_kb_category: string | null;
  comparison_instruction: string;
  ai_persona: string;
  allowed_service_types: string[];
  forbidden_terms: string[];
  image_selection_rules: string;
  intent_collection_order: string;
  tier_special_rules: string;
  trivial_replies: string[];
  tax_id_keywords: string[];
};

export default function Settings() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [clearing, setClearing] = useState(false);
  const [kbCategories, setKbCategories] = useState<string[]>([]);

  const clearTestData = async (mode: "conversations" | "all") => {
    setClearing(true);
    try {
      const { error: convErr } = await supabase.from("conversations").delete().not("id", "is", null);
      if (convErr) throw convErr;
      if (mode === "all") {
        const { error: custErr } = await supabase.from("customers").delete().not("id", "is", null);
        if (custErr) throw custErr;
      } else {
        // Reset AI context fields on customers so AI doesn't "remember" deleted chats
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
    supabase.from("knowledge_categories").select("name").order("sort_order")
      .then(({ data }) => setKbCategories((data ?? []).map((c: any) => c.name)));
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({
      ai_enabled: s.ai_enabled, confidence_threshold: s.confidence_threshold, cooldown_minutes: s.cooldown_minutes,
      manual_chat_hours: s.manual_chat_hours, phone_mute_hours: s.phone_mute_hours, fallback_mute_hours: s.fallback_mute_hours,
      followup_hours: s.followup_hours, followup_enabled: s.followup_enabled, schedule_enabled: s.schedule_enabled,
      start_time: s.start_time, end_time: s.end_time, strict_rules: s.strict_rules, sla_hours: s.sla_hours, fallback_message: s.fallback_message,
      debounce_seconds: s.debounce_seconds,
      comparison_phase_enabled: s.comparison_phase_enabled,
      comparison_kb_category: s.comparison_kb_category,
      ai_persona: s.ai_persona,
      trivial_replies: s.trivial_replies,
      tax_id_keywords: s.tax_id_keywords,
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
          <div className="space-y-1.5 p-4 rounded-lg bg-muted/50">
            <Label>รอลูกค้าพิมพ์เสร็จก่อนตอบ (วินาที)</Label>
            <Input type="number" min={0} max={120} value={s.debounce_seconds ?? 15} onChange={e=>upd("debounce_seconds",+e.target.value)} />
            <p className="text-xs text-muted-foreground">ถ้าลูกค้าพิมพ์หลายข้อความติดกัน AI จะรอตามจำนวนวินาทีนี้แล้วตอบรวมทีเดียว (แนะนำ 10–20 วิ, ใส่ 0 = ปิด)</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-5"><Bot className="text-primary"/><h2 className="font-display text-lg font-semibold">บทบาท AI (Persona)</h2></div>
        <div className="space-y-1.5">
          <Label>AI คือใคร พูดยังไง</Label>
          <Textarea rows={3} value={s.ai_persona} onChange={e=>upd("ai_persona", e.target.value)} placeholder='เช่น "คุณคือ AI ผู้ช่วยร้านสปา..."' />
          <p className="text-xs text-muted-foreground">บรรทัดแรกของ prompt — กำหนดน้ำเสียง/อาชีพของ AI ส่วน "กฎที่ต้องทำตาม" ใส่ในการ์ด "กฎ AI" ด้านล่าง</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <div className="space-y-1.5">
            <Label>คำที่ไม่ต้องตอบ (Trivial replies)</Label>
            <Input value={s.trivial_replies.join(", ")} onChange={e=>upd("trivial_replies", e.target.value.split(",").map(x=>x.trim()).filter(Boolean))} />
            <p className="text-xs text-muted-foreground">เช่น ok, ขอบคุณ, 👍</p>
          </div>
          <div className="space-y-1.5">
            <Label>คีย์เวิร์ด Tax ID</Label>
            <Input value={s.tax_id_keywords.join(", ")} onChange={e=>upd("tax_id_keywords", e.target.value.split(",").map(x=>x.trim()).filter(Boolean))} />
            <p className="text-xs text-muted-foreground">คำที่บ่งบอกว่าเป็นเลขผู้เสียภาษี</p>
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

      <Card className="p-6 shadow-soft border-border/60 bg-primary/5">
        <div className="flex items-center gap-2 mb-2"><Shield className="text-primary"/><h2 className="font-display text-lg font-semibold">กฎ AI ย้ายไปอยู่ใน "สอน AI" แล้ว</h2></div>
        <p className="text-xs text-muted-foreground mb-3">เพื่อรวมที่สอน AI ไว้ที่เดียว กฎ AI (วิธีคุย/ห้าม/ต้อง) ถูกย้ายไปอยู่ในแท็บ <b>กฎ AI</b> ของหน้าสอน AI</p>
        <a href="/knowledge" className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-sm">
          ไปหน้าสอน AI → แท็บ "กฎ AI" →
        </a>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center gap-2 mb-1"><Bot className="text-primary"/><h2 className="font-display text-lg font-semibold">กลยุทธ์ส่งรูปเปรียบเทียบ (Phase 1)</h2></div>
        <p className="text-xs text-muted-foreground mb-4">
          เมื่อลูกค้ายังไม่ระบุงบ/ระดับแพ็กเกจ AI จะส่ง "รูปเปรียบเทียบ" จาก KB หมวดที่เลือกก่อน เพื่อให้ลูกค้าเลือกตามงบเอง พอเลือกแล้วค่อยส่งรูปรายละเอียดของระดับนั้นโดยเฉพาะ
        </p>
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-4">
          <div><Label className="font-medium">เปิดใช้กลยุทธ์นี้</Label><p className="text-xs text-muted-foreground mt-1">ปิดไว้ถ้าธุรกิจไม่ได้แบ่งระดับราคาแบบหลาย tier</p></div>
          <Switch checked={s.comparison_phase_enabled} onCheckedChange={v=>upd("comparison_phase_enabled",v)} />
        </div>
        <div className="space-y-1.5">
          <Label>หมวด Knowledge Base สำหรับรูปเปรียบเทียบ</Label>
          <select
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            value={s.comparison_kb_category ?? ""}
            onChange={e=>upd("comparison_kb_category", e.target.value || null)}
            disabled={!s.comparison_phase_enabled}
          >
            <option value="">— เลือกหมวด —</option>
            {kbCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">ตั้ง entry ใน KB หมวดนี้แยกตามช่วงจำนวนคน เช่น "เปรียบเทียบ 40 ท่าน", "เปรียบเทียบ 100 ท่าน"</p>
        </div>
      </Card>

      <Card className="p-6 shadow-soft border-border/60">
        <h2 className="font-display text-lg font-semibold mb-4">ข้อความ Fallback</h2>
        <Textarea value={s.fallback_message} onChange={e=>upd("fallback_message",e.target.value)} rows={4} />
        <p className="text-xs text-muted-foreground mt-2">ข้อความที่ส่งเมื่อ AI ตอบไม่ได้ หรือนอกเวลาทำการ</p>
      </Card>
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
