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
import { Loader2, Save, Bot, MessageCircle, Image as ImageIcon, AlignLeft, MessageSquare, Database, Plus, Trash2, ArrowUp, ArrowDown, ClipboardList } from "lucide-react";
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
      
      image_rule_no_extra: s.image_rule_no_extra,
      image_rule_no_format: s.image_rule_no_format,
      image_rule_no_repeat: s.image_rule_no_repeat,
      intent_fields: s.intent_fields,
      handover_summary_header: s.handover_summary_header,
      handover_summary_fields: s.handover_summary_fields,
      handover_intro_phone: s.handover_intro_phone,
      handover_intro_tax: s.handover_intro_tax,
      handover_intro_postcap: s.handover_intro_postcap,
      handover_extract_enabled: s.handover_extract_enabled,
      handover_extract_timeout_ms: s.handover_extract_timeout_ms,
      handover_extract_triggers: s.handover_extract_triggers,
      handover_extract_overwrite_mode: s.handover_extract_overwrite_mode,
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
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto">
          <TabsTrigger value="persona" className="gap-1.5"><Bot className="w-4 h-4" />Persona</TabsTrigger>
          <TabsTrigger value="pronouns" className="gap-1.5"><MessageCircle className="w-4 h-4" />สรรพนาม</TabsTrigger>
          <TabsTrigger value="style" className="gap-1.5"><AlignLeft className="w-4 h-4" />สไตล์การตอบ</TabsTrigger>
          <TabsTrigger value="intent" className="gap-1.5"><Database className="w-4 h-4" />ข้อมูลที่เก็บ</TabsTrigger>
          <TabsTrigger value="handover" className="gap-1.5"><ClipboardList className="w-4 h-4" />ฟอร์มส่งต่อ</TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5"><ImageIcon className="w-4 h-4" />กลยุทธ์รูป</TabsTrigger>
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



        <TabsContent value="intent" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60 space-y-4">
            <div>
              <div className="flex items-center gap-2"><Database className="text-primary" /><h2 className="font-display text-lg font-semibold">ข้อมูลที่ AI ต้องเก็บจากลูกค้า</h2></div>
              <p className="text-xs text-muted-foreground mt-1">
                กำหนด field ที่ให้ AI สกัดและเก็บอัตโนมัติจากบทสนทนา เช่น "รูปแบบงาน", "ข้อจำกัดอาหาร" — ค่าจะเก็บใน <code className="text-[10px] bg-muted px-1 rounded">customers.intent_data</code> และแสดงใน prompt "ข้อมูลที่เก็บไว้แล้ว" ทุกครั้ง
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                💡 <b>เคล็ดลับ:</b> ใส่ "ค่าที่อนุญาต" เพื่อล็อกค่า (กัน AI ใส่มั่ว) + ทำให้แอดมินแก้ไขได้ใน /chats ผ่าน dropdown — <b>ถ้าไม่ใส่ค่า field นี้จะไม่แสดงให้แอดมินแก้</b>. ใส่ "คำสั่ง" เพื่อบอก AI ว่าทำอะไรเมื่อรู้ค่าแล้ว เช่น "ห้ามถามซ้ำ"
              </p>
            </div>

            <div className="space-y-3">
              {(Array.isArray(s.intent_fields) ? s.intent_fields : []).map((f: any, idx: number) => (
                <Card key={idx} className="p-4 bg-muted/30 space-y-3 border-border/40">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Key (อังกฤษ, ไม่มีเว้นวรรค)</Label>
                        <Input value={f.key ?? ""} onChange={e => {
                          const v = e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
                          const arr = [...s.intent_fields]; arr[idx] = { ...arr[idx], key: v }; upd("intent_fields", arr);
                        }} placeholder="service_type" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ป้ายชื่อ (ไทย)</Label>
                        <Input value={f.label ?? ""} onChange={e => {
                          const arr = [...s.intent_fields]; arr[idx] = { ...arr[idx], label: e.target.value }; upd("intent_fields", arr);
                        }} placeholder="รูปแบบงาน" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => {
                        const arr = [...s.intent_fields]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; upd("intent_fields", arr);
                      }}><ArrowUp className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === s.intent_fields.length - 1} onClick={() => {
                        const arr = [...s.intent_fields]; [arr[idx+1], arr[idx]] = [arr[idx], arr[idx+1]]; upd("intent_fields", arr);
                      }}><ArrowDown className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                        if (!confirm(`ลบ field "${f.label || f.key}"?`)) return;
                        upd("intent_fields", s.intent_fields.filter((_: any, i: number) => i !== idx));
                      }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ค่าที่อนุญาต (1 ค่าต่อบรรทัด — เว้นว่างถ้า free-text)</Label>
                    <Textarea rows={2} value={(f.values ?? []).join("\n")} onChange={e => {
                      const arr = [...s.intent_fields]; arr[idx] = { ...arr[idx], values: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) }; upd("intent_fields", arr);
                    }} placeholder={"บุฟเฟ่ต์\nซุ้มอาหาร\nโต๊ะจีน"} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">คำสั่ง AI เมื่อรู้ค่านี้แล้ว (optional)</Label>
                    <Textarea rows={2} value={f.instruction ?? ""} onChange={e => {
                      const arr = [...s.intent_fields]; arr[idx] = { ...arr[idx], instruction: e.target.value }; upd("intent_fields", arr);
                    }} placeholder="ถ้ารู้รูปแบบงานแล้ว ห้ามถามซ้ำเด็ดขาด ให้ส่งรูปเมนูที่ตรงทันทีเมื่อขอ" className="text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!f.required} onCheckedChange={v => {
                      const arr = [...s.intent_fields]; arr[idx] = { ...arr[idx], required: v }; upd("intent_fields", arr);
                    }} />
                    <Label className="text-xs">จำเป็น (AI จะถามจนกว่าจะได้)</Label>
                  </div>
                </Card>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => {
              const arr = Array.isArray(s.intent_fields) ? [...s.intent_fields] : [];
              arr.push({ key: "", label: "", values: [], required: false, instruction: "" });
              upd("intent_fields", arr);
            }}><Plus className="w-4 h-4" /> เพิ่ม field</Button>
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

        <TabsContent value="handover" className="mt-4">
          <Card className="p-6 shadow-soft border-border/60 space-y-6">
            <div className="flex items-center gap-2"><ClipboardList className="text-primary" /><h2 className="font-display text-lg font-semibold">ฟอร์มส่งต่อแอดมิน</h2></div>
            <p className="text-xs text-muted-foreground -mt-3">ปรับแต่งข้อความตอบลูกค้า + ฟอร์มสรุปข้อมูลที่บอทส่งให้ลูกค้าตอนได้เบอร์/Tax ID/ครบโควต้าตอบ — ใช้ <code className="bg-muted px-1 rounded">{'{phone}'}</code>, <code className="bg-muted px-1 rounded">{'{tax_id}'}</code> เป็น placeholder ได้</p>

            <div className="space-y-1.5">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="font-medium">🤖 AI วิเคราะห์บทสนทนาก่อนสรุป</Label>
                  <p className="text-xs text-muted-foreground mt-1">เปิดไว้ → ตอนได้เบอร์/Tax/ครบโควต้า บอทจะเรียก AI สแกนแชตทั้งหมดเพื่อเก็บ ประเภทงาน/จำนวน/วันจัด/สถานที่ ก่อนส่งสรุป (เพิ่ม latency ~1-2s, ~0.001฿/ครั้ง)</p>
                </div>
                <Switch checked={s.handover_extract_enabled !== false} onCheckedChange={v => upd("handover_extract_enabled", v)} />
              </div>

              <div className={s.handover_extract_enabled === false ? "opacity-50 pointer-events-none space-y-4" : "space-y-4"}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timeout (ms)</Label>
                    <Input type="number" min={500} max={15000} step={500} value={s.handover_extract_timeout_ms ?? 3000} onChange={e => upd("handover_extract_timeout_ms", Math.max(500, Math.min(15000, parseInt(e.target.value) || 3000)))} />
                    <p className="text-[11px] text-muted-foreground">ถ้า AI ตอบช้ากว่านี้ → ข้าม ส่งสรุปด้วยข้อมูลเดิม</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">โหมดทับค่า</Label>
                    <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={s.handover_extract_overwrite_mode ?? "fill_only"} onChange={e => upd("handover_extract_overwrite_mode", e.target.value)}>
                      <option value="fill_only">เติมเฉพาะช่องว่าง (ปลอดภัย — แนะนำ)</option>
                      <option value="overwrite">ทับค่าเดิมเสมอ (เอาล่าสุดทุกครั้ง)</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">fill_only: ไม่แตะข้อมูลที่แอดมินใส่ไว้แล้ว</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">เปิดใช้ตอนไหน</Label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { key: "phone", label: "ได้เบอร์โทร" },
                      { key: "tax_id", label: "ได้ Tax ID" },
                      { key: "postcap", label: "AI ตอบครบโควต้า" },
                    ].map(t => {
                      const arr: string[] = Array.isArray(s.handover_extract_triggers) ? s.handover_extract_triggers : ["phone","tax_id","postcap"];
                      const on = arr.includes(t.key);
                      return (
                        <label key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background cursor-pointer">
                          <Switch checked={on} onCheckedChange={v => {
                            const next = v ? Array.from(new Set([...arr, t.key])) : arr.filter(x => x !== t.key);
                            upd("handover_extract_triggers", next);
                          }} />
                          <span className="text-sm">{t.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>หัวข้อสรุป</Label>
              <Input value={s.handover_summary_header ?? ""} onChange={e => upd("handover_summary_header", e.target.value)} placeholder="📋 สรุปข้อมูลที่ได้รับ:" />
            </div>

            <div className="space-y-2">
              <Label>ฟิลด์ในสรุป (ลำดับ + label + เปิด/ปิด)</Label>
              <div className="space-y-2">

                {((s.handover_summary_fields ?? []) as any[]).map((f: any, i: number) => {
                  const arr = [...((s.handover_summary_fields ?? []) as any[])];
                  const move = (d: number) => {
                    const j = i + d; if (j < 0 || j >= arr.length) return;
                    [arr[i], arr[j]] = [arr[j], arr[i]]; upd("handover_summary_fields", arr);
                  };
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40">
                      <code className="text-xs bg-background px-2 py-1 rounded min-w-[100px]">{f.key}</code>
                      <Input className="flex-1" placeholder="label" value={f.label ?? ""} onChange={e => { const a = [...arr]; a[i] = { ...f, label: e.target.value }; upd("handover_summary_fields", a); }} />
                      <Input className="w-32" placeholder="suffix" value={f.suffix ?? ""} onChange={e => { const a = [...arr]; a[i] = { ...f, suffix: e.target.value }; upd("handover_summary_fields", a); }} />
                      <Switch checked={f.enabled !== false} onCheckedChange={v => { const a = [...arr]; a[i] = { ...f, enabled: v }; upd("handover_summary_fields", a); }} />
                      <Button size="sm" variant="ghost" onClick={() => move(-1)} disabled={i === 0}><ArrowUp className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => move(1)} disabled={i === arr.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { const a = arr.filter((_, j) => j !== i); upd("handover_summary_fields", a); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => {
                  const k = prompt("ชื่อ field (key) จาก customers หรือ intent_data:"); if (!k) return;
                  const arr = [...((s.handover_summary_fields ?? []) as any[]), { key: k, label: k, enabled: true }];
                  upd("handover_summary_fields", arr);
                }}><Plus className="w-4 h-4" /> เพิ่มฟิลด์</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">ฟิลด์ที่ใช้ได้: nickname, phone, tax_id, event_type, venue, event_date, guest_count (ข้อมูลใน intent_data จะถูกแสดงต่อท้ายอัตโนมัติตามการตั้งค่า "ข้อมูลที่เก็บ")</p>
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความตอนได้เบอร์โทร</Label>
              <Textarea rows={4} value={s.handover_intro_phone ?? ""} onChange={e => upd("handover_intro_phone", e.target.value)} placeholder="ใช้ {phone} เพื่อแทนเบอร์ที่ลูกค้าให้มา" />
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความตอนได้ Tax ID</Label>
              <Textarea rows={3} value={s.handover_intro_tax ?? ""} onChange={e => upd("handover_intro_tax", e.target.value)} placeholder="ใช้ {tax_id} เพื่อแทนเลข Tax ID" />
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความตอน AI ตอบครบโควต้าหลังได้เบอร์</Label>
              <Textarea rows={3} value={s.handover_intro_postcap ?? ""} onChange={e => upd("handover_intro_postcap", e.target.value)} />
            </div>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
