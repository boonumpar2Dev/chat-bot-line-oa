import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Save, Bot, MessageCircle, Image as ImageIcon, AlignLeft, MessageSquare, UserCheck } from "lucide-react";
import { toast } from "sonner";

type Cfg = any;

export default function AiSettings() {
  const [s, setS] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kbCategories, setKbCategories] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("app_settings").select("*").eq("key", "ai_config").maybeSingle()
      .then(({ data }) => { setS(data as any); setLoading(false); });
    supabase.from("knowledge_categories").select("name").order("sort_order")
      .then(({ data }) => setKbCategories((data ?? []).map((c: any) => c.name)));
  }, []);

  const upd = (k: string, v: any) => setS((p: Cfg) => p ? { ...p, [k]: v } : p);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({
      ai_persona: s.ai_persona,
      trivial_replies: s.trivial_replies,
      tax_id_keywords: s.tax_id_keywords,
      self_pronouns_allowed: s.self_pronouns_allowed,
      customer_pronouns_allowed: s.customer_pronouns_allowed,
      forbidden_pronouns: s.forbidden_pronouns,
      reply_length: s.reply_length,
      reply_bubbles: s.reply_bubbles,
      comparison_phase_enabled: s.comparison_phase_enabled,
      comparison_kb_category: s.comparison_kb_category,
      comparison_instruction: s.comparison_instruction,
      phase2_instruction: s.phase2_instruction,
      max_images_per_reply: s.max_images_per_reply,
      menu_request_keywords: s.menu_request_keywords,
      kb_menu_title_keywords: s.kb_menu_title_keywords,
      service_area_kb_title: s.service_area_kb_title,
      location_keywords: s.location_keywords,
      fallback_message: s.fallback_message,
      image_rule_no_extra: s.image_rule_no_extra,
      image_rule_no_format: s.image_rule_no_format,
      image_rule_no_repeat: s.image_rule_no_repeat,
      returning_customer_greeting: s.returning_customer_greeting,
      vip_customer_greeting: s.vip_customer_greeting,
      returning_skip_intent_questions: s.returning_skip_intent_questions,
      returning_days_threshold: s.returning_days_threshold,
      returning_context_instruction: s.returning_context_instruction,
    }).eq("key", "ai_config");
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("บันทึกแล้ว");
  };

  if (loading || !s) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">ตั้งค่า AI</h1>
          <p className="text-muted-foreground mt-1">ปรับบทบาท สรรพนาม สไตล์การตอบ และกลยุทธ์ส่งรูป</p>
        </div>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
        </Button>
      </div>

      <Tabs defaultValue="persona" className="w-full">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto">
          <TabsTrigger value="persona" className="gap-1.5"><Bot className="w-4 h-4" />Persona</TabsTrigger>
          <TabsTrigger value="pronouns" className="gap-1.5"><MessageCircle className="w-4 h-4" />สรรพนาม</TabsTrigger>
          <TabsTrigger value="style" className="gap-1.5"><AlignLeft className="w-4 h-4" />สไตล์การตอบ</TabsTrigger>
          <TabsTrigger value="returning" className="gap-1.5"><UserCheck className="w-4 h-4" />ลูกค้าเก่า</TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5"><ImageIcon className="w-4 h-4" />กลยุทธ์รูป</TabsTrigger>
          <TabsTrigger value="fallback" className="gap-1.5"><MessageSquare className="w-4 h-4" />Fallback</TabsTrigger>
        </TabsList>

        <TabsContent value="persona" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60 space-y-5">
            <div className="flex items-center gap-2"><Bot className="text-primary" /><h2 className="font-display text-lg font-semibold">บทบาท AI (Persona)</h2></div>
            <div className="space-y-1.5">
              <Label>AI คือใคร พูดยังไง</Label>
              <Textarea rows={3} value={s.ai_persona ?? ""} onChange={e => upd("ai_persona", e.target.value)} placeholder='เช่น "คุณคือ AI ผู้ช่วยร้านสปา..."' />
              <p className="text-xs text-muted-foreground">บรรทัดแรกของ prompt — กำหนดน้ำเสียง/อาชีพของ AI</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>คำที่ไม่ต้องตอบ (Trivial replies)</Label>
                <Input value={(s.trivial_replies ?? []).join(", ")} onChange={e => upd("trivial_replies", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} />
                <p className="text-xs text-muted-foreground">เช่น ok, ขอบคุณ, 👍</p>
              </div>
              <div className="space-y-1.5">
                <Label>คีย์เวิร์ด Tax ID</Label>
                <Input value={(s.tax_id_keywords ?? []).join(", ")} onChange={e => upd("tax_id_keywords", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} />
                <p className="text-xs text-muted-foreground">คำที่บ่งบอกว่าเป็นเลขผู้เสียภาษี</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pronouns" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60 space-y-4">
            <div>
              <div className="flex items-center gap-2"><MessageCircle className="text-primary" /><h2 className="font-display text-lg font-semibold">สรรพนามของบอท</h2></div>
              <p className="text-xs text-muted-foreground mt-1">กำหนดว่าบอทเรียกตัวเองว่าอะไร เรียกลูกค้าว่าอะไร และคำไหนห้ามใช้</p>
            </div>
            <div className="space-y-1.5">
              <Label>แทนตัวเองได้ (คั่นด้วย ,)</Label>
              <Input value={(s.self_pronouns_allowed ?? []).join(", ")} onChange={e => upd("self_pronouns_allowed", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} placeholder="ทีมงาน, แอดมิน, บุญนำพา" />
            </div>
            <div className="space-y-1.5">
              <Label>เรียกลูกค้าได้ (คั่นด้วย ,)</Label>
              <Input value={(s.customer_pronouns_allowed ?? []).join(", ")} onChange={e => upd("customer_pronouns_allowed", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} placeholder="ลูกค้า, คุณ{ชื่อ}" />
              <p className="text-xs text-muted-foreground">ใช้ <code>{"{ชื่อ}"}</code> เพื่อให้บอทแทนชื่อลูกค้าจริง</p>
            </div>
            <div className="space-y-1.5">
              <Label>คำต้องห้าม (คั่นด้วย ,)</Label>
              <Textarea rows={2} value={(s.forbidden_pronouns ?? []).join(", ")} onChange={e => upd("forbidden_pronouns", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} placeholder="แม่หมอ, พี่, น้อง, ตัวเอง, เธอ..." />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="style" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60 space-y-5">
            <div>
              <div className="flex items-center gap-2"><AlignLeft className="text-primary" /><h2 className="font-display text-lg font-semibold">สไตล์การตอบ</h2></div>
              <p className="text-xs text-muted-foreground mt-1">คุมความสั้น-ยาวของคำตอบ และจำนวนบับเบิลที่ส่งต่อรอบ — ค่านี้จะถูกแทรกเป็นกฎทุกครั้งที่ AI ตอบ</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ความยาวสูงสุดต่อบับเบิล (คำ)</Label>
                <Input type="number" min={10} max={500} value={s.reply_length ?? 60} onChange={e => upd("reply_length", Math.max(10, Math.min(500, parseInt(e.target.value) || 60)))} />
                <p className="text-xs text-muted-foreground">แนะนำ 40–80 คำ — ตอบสั้น อ่านง่าย</p>
              </div>
              <div className="space-y-1.5">
                <Label>จำนวนบับเบิลสูงสุดต่อรอบ</Label>
                <Input type="number" min={1} max={10} value={s.reply_bubbles ?? 3} onChange={e => upd("reply_bubbles", Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))} />
                <p className="text-xs text-muted-foreground">AI จะแยกบับเบิลด้วย "---" — แนะนำ 2–3</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60">
            <div className="flex items-center gap-2 mb-1"><ImageIcon className="text-primary" /><h2 className="font-display text-lg font-semibold">กลยุทธ์ส่งรูปเปรียบเทียบ (Phase 1)</h2></div>
            <p className="text-xs text-muted-foreground mb-4">
              เมื่อลูกค้ายังไม่ระบุงบ/ระดับแพ็กเกจ AI จะส่ง "รูปเปรียบเทียบ" จาก KB หมวดที่เลือกก่อน เพื่อให้ลูกค้าเลือกตามงบเอง พอเลือกแล้วค่อยส่งรูปรายละเอียดของระดับนั้นโดยเฉพาะ
            </p>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-4">
              <div><Label className="font-medium">เปิดใช้กลยุทธ์นี้</Label><p className="text-xs text-muted-foreground mt-1">ปิดไว้ถ้าธุรกิจไม่ได้แบ่งระดับราคาแบบหลาย tier</p></div>
              <Switch checked={s.comparison_phase_enabled} onCheckedChange={v => upd("comparison_phase_enabled", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>หมวด Knowledge Base สำหรับรูปเปรียบเทียบ</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={s.comparison_kb_category ?? ""}
                onChange={e => upd("comparison_kb_category", e.target.value || null)}
                disabled={!s.comparison_phase_enabled}
              >
                <option value="">— เลือกหมวด —</option>
                {kbCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">ตั้ง entry ใน KB หมวดนี้แยกตามช่วงจำนวนคน เช่น "เปรียบเทียบ 40 ท่าน", "เปรียบเทียบ 100 ท่าน"</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>น้ำเสียง AI ตอนส่งรูปเปรียบเทียบ (Phase 1)</Label>
              <Textarea rows={4} value={s.comparison_instruction ?? ""} onChange={e => upd("comparison_instruction", e.target.value)} disabled={!s.comparison_phase_enabled} placeholder='เช่น "พูดแบบที่ปรึกษา ไม่ใช่สคริปต์..."' />
              <p className="text-xs text-muted-foreground">กำหนดว่า AI ควรพูดยังไงตอนแนบรูปเปรียบเทียบ</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>กฎเลือกรูปตอนลูกค้าเลือกแพ็ก/ระดับแล้ว (Phase 2)</Label>
              <Textarea rows={5} value={s.phase2_instruction ?? ""} onChange={e => upd("phase2_instruction", e.target.value)} placeholder='เช่น "ส่งเฉพาะรูป tier ที่แนะนำเท่านั้น..."' />
              <p className="text-xs text-muted-foreground">กันไม่ให้ AI แถมรูปเมนู/รูปอื่นเวลาลูกค้าถามแค่แพ็กเกจ/ราคา</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>จำนวนรูปสูงสุดต่อข้อความ (1-20)</Label>
              <Input type="number" min={1} max={20} value={s.max_images_per_reply ?? 5} onChange={e => upd("max_images_per_reply", Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))} />
              <p className="text-xs text-muted-foreground">แนะนำ 4–6</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>คำที่ลูกค้าใช้ขอดูรูปเมนู/ตัวอย่าง (1 คำต่อบรรทัด)</Label>
              <Textarea rows={4} value={(s.menu_request_keywords ?? []).join("\n")} onChange={e => upd("menu_request_keywords", e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean))} placeholder={"เมนู\nตัวอย่าง\nดูรูป\nรูปอาหาร"} />
              <p className="text-xs text-muted-foreground">ถ้าลูกค้าพิมพ์คำใดคำหนึ่ง → AI ได้รับอนุญาตให้แนบรูป KB เมนู/ตัวอย่าง</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>คำในชื่อ KB ที่ถือว่าเป็นรูปเมนู/ตัวอย่าง (1 คำต่อบรรทัด)</Label>
              <Textarea rows={3} value={(s.kb_menu_title_keywords ?? []).join("\n")} onChange={e => upd("kb_menu_title_keywords", e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean))} placeholder={"เมนู\nตัวอย่าง\nซุ้ม"} />
              <p className="text-xs text-muted-foreground">ชื่อ KB ที่มีคำเหล่านี้จะถูก drop เมื่อลูกค้าไม่ได้ขอดูเมนู</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>ชื่อ KB ที่เป็น whitelist พื้นที่ให้บริการ</Label>
              <Input value={s.service_area_kb_title ?? ""} onChange={e => upd("service_area_kb_title", e.target.value)} placeholder="พื้นที่ที่บุญนำพาสามารถไปให้บริการได้" />
              <p className="text-xs text-muted-foreground">ใส่ชื่อ KB ตรงตามที่ตั้งไว้</p>
            </div>
            <div className="space-y-1.5 mt-5">
              <Label>คำที่บ่งบอกว่าลูกค้าพูดถึงสถานที่/จังหวัด (1 คำต่อบรรทัด)</Label>
              <Textarea rows={6} value={(s.location_keywords ?? []).join("\n")} onChange={e => upd("location_keywords", e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean))} placeholder={"จังหวัด\nจัดที่\nอ.\nอำเภอ\nเชียงใหม่\nภูเก็ต"} />
              <p className="text-xs text-muted-foreground">trigger ให้เช็ก whitelist พื้นที่</p>
            </div>

            <Accordion type="single" collapsible className="mt-6">
              <AccordionItem value="adv-image-rules" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="text-left">
                    <div className="font-display text-base font-semibold">⚙️ กฎการส่งรูปขั้นสูง</div>
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">กำหนดพฤติกรรมการส่งรูปในแต่ละสถานการณ์</div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-5 pt-2">
                  <div className="space-y-1.5">
                    <Label>เมื่อลูกค้าถามเรื่องอื่น (ไม่ได้ขอรูป)</Label>
                    <Textarea rows={2} value={s.image_rule_no_extra ?? ""} onChange={e => upd("image_rule_no_extra", e.target.value)} />
                    <p className="text-xs text-muted-foreground">เช่น ถามชิม/ค่าส่ง/เงื่อนไข/ราคา → ห้ามแถมรูป</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>เมื่อลูกค้าบอกจำนวนคนแต่ยังไม่ระบุรูปแบบ</Label>
                    <Textarea rows={2} value={s.image_rule_no_format ?? ""} onChange={e => upd("image_rule_no_format", e.target.value)} />
                    <p className="text-xs text-muted-foreground">ให้ส่งภาพรวมก่อนเสมอ ไม่ว่าจะรู้จำนวนคนแล้วก็ตาม</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>เมื่อเคยส่งรูปเปรียบเทียบไปแล้ว</Label>
                    <Textarea rows={2} value={s.image_rule_no_repeat ?? ""} onChange={e => upd("image_rule_no_repeat", e.target.value)} />
                    <p className="text-xs text-muted-foreground">ป้องกันการส่งรูปซ้ำหลังลูกค้าตัดสินใจแล้ว</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        </TabsContent>

        <TabsContent value="fallback" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60">
            <div className="flex items-center gap-2 mb-4"><MessageSquare className="text-primary" /><h2 className="font-display text-lg font-semibold">ข้อความ Fallback</h2></div>
            <Textarea value={s.fallback_message ?? ""} onChange={e => upd("fallback_message", e.target.value)} rows={4} />
            <p className="text-xs text-muted-foreground mt-2">ข้อความที่ส่งเมื่อ AI ตอบไม่ได้ หรือนอกเวลาทำการ</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
