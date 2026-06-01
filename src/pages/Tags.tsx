import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tag as TagIcon, Plus, Pencil, Trash2, Sparkles, Users, Save, Check, Wand2, RefreshCw, ChevronDown, Info, GitMerge, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Tag = {
  id: string; name: string; color: string;
  description: string | null; ai_tag_instructions: string | null; sort_order: number;
};

type CustomRule = { pattern: string; tag: string; flags?: string };
type AutoTagSettings = {
  enabled: boolean;
  locale: "th" | "en";
  year_format: "be" | "ce";
  month_format: "short_th" | "full_th" | "short_en" | "full_en" | "number";
  status_tag_map: Record<string, string>;
  custom_name_rules: CustomRule[];
};

const PRESET_COLORS = ["#94a3b8","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#64748b"];

const STATUS_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า",
  pending_quote: "รอเสนอราคา", pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม", cancelled: "ยกเลิก",
};
const STATUS_KEYS = ["new","inquiry","returning","pending_quote","pending_confirm","confirmed","cancelled"];

const MONTH_PREVIEW: Record<string, string[]> = {
  short_th: ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."],
  full_th: ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"],
  short_en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  full_en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  number: ["01","02","03","04","05","06","07","08","09","10","11","12"],
};

const DEFAULT_AUTO: AutoTagSettings = {
  enabled: true, locale: "th", year_format: "be", month_format: "short_th",
  status_tag_map: { inquiry: "ลูกค้ากลุ่มคาดหวัง", pending_quote: "รอเสนอราคา", pending_confirm: "รอคอนเฟิร์ม", confirmed: "คอนเฟิร์ม", cancelled: "ยกเลิก" },
  custom_name_rules: [],
};

export default function Tags() {
  const nav = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<Record<string, string>>({});
  const [savingAi, setSavingAi] = useState<string | null>(null);
  const [savedAi, setSavedAi] = useState<string | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Auto-tag settings
  const [auto, setAuto] = useState<AutoTagSettings>(DEFAULT_AUTO);
  const [autoDirty, setAutoDirty] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: tagData }, { data: custData }, { data: cfg }] = await Promise.all([
      supabase.from("tags").select("*").order("sort_order").order("name"),
      supabase.from("customers").select("tags"),
      supabase.from("app_settings").select("auto_tag_settings").eq("key","ai_config").maybeSingle(),
    ]);
    const c: Record<string, number> = {};
    (custData || []).forEach((row: any) => (row.tags || []).forEach((t: string) => { c[t] = (c[t] || 0) + 1; }));
    setTags((tagData as Tag[]) || []);
    setCounts(c);
    setAiDrafts({});
    setSelected(new Set());
    if (cfg?.auto_tag_settings) setAuto({ ...DEFAULT_AUTO, ...(cfg.auto_tag_settings as any) });
    setAutoDirty(false);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error("กรุณาใส่ชื่อแท็ก"); return; }
    setSaving(true);
    const payload = {
      name: editing.name.trim(), color: editing.color || "#94a3b8",
      description: editing.description || null, sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from("tags").update(payload).eq("id", editing.id)
      : await supabase.from("tags").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "อัปเดตแท็กแล้ว" : "เพิ่มแท็กแล้ว");
    setEditing(null); load();
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("tags").delete().eq("id", deleting.id);
    if (error) { toast.error(error.message); return; }
    toast.success("ลบแท็กแล้ว"); setDeleting(null); load();
  };

  const saveAi = async (tag: Tag) => {
    const value = (aiDrafts[tag.id] ?? tag.ai_tag_instructions ?? "").trim();
    setSavingAi(tag.id);
    const { error } = await supabase.from("tags").update({ ai_tag_instructions: value || null }).eq("id", tag.id);
    setSavingAi(null);
    if (error) { toast.error(error.message); return; }
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, ai_tag_instructions: value || null } : t));
    setAiDrafts(prev => { const n = { ...prev }; delete n[tag.id]; return n; });
    setSavedAi(tag.id);
    setTimeout(() => setSavedAi(s => s === tag.id ? null : s), 1500);
  };

  const patchAuto = (patch: Partial<AutoTagSettings>) => { setAuto(a => ({ ...a, ...patch })); setAutoDirty(true); };

  const saveAuto = async () => {
    setSavingAuto(true);
    const { error } = await supabase.from("app_settings").update({ auto_tag_settings: auto as any }).eq("key","ai_config");
    setSavingAuto(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกการตั้งค่าแล้ว");
    setAutoDirty(false);
  };

  const rescan = async () => {
    setRescanning(true);
    const { data, error } = await supabase.rpc("rescan_auto_tags");
    setRescanning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`สแกนเสร็จ — อัปเดตลูกค้า ${data ?? 0} ราย`);
    load();
  };

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const selectedTags = useMemo(() => tags.filter(t => selected.has(t.id)), [tags, selected]);

  const runBulkDelete = async () => {
    const names = selectedTags.map(t => t.name);
    if (!names.length) return;
    setBulkBusy(true);
    const { data, error } = await supabase.rpc("bulk_delete_tags", { _names: names, _strip_from_customers: true });
    setBulkBusy(false); setBulkDeleteOpen(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`ลบ ${names.length} แท็ก · อัปเดตลูกค้า ${data ?? 0} ราย`);
    load();
  };

  const runMerge = async () => {
    const target = mergeTarget.trim();
    if (!target) { toast.error("กรุณาใส่ชื่อแท็กปลายทาง"); return; }
    const sources = selectedTags.map(t => t.name).filter(n => n !== target);
    if (!sources.length) { toast.error("เลือกอย่างน้อย 1 แท็กที่จะรวม (ที่ไม่ใช่ปลายทาง)"); return; }
    setBulkBusy(true);
    const { data, error } = await supabase.rpc("merge_tags", { _source_names: sources, _target_name: target });
    setBulkBusy(false); setMergeOpen(false); setMergeTarget("");
    if (error) { toast.error(error.message); return; }
    toast.success(`รวมเป็น "${target}" · อัปเดตลูกค้า ${data ?? 0} ราย`);
    load();
  };

  // Live preview tags from sample nickname
  const [previewName, setPreviewName] = useState("ตัวเล็ก15พค69");
  const previewTags = useMemo(() => computePreview(previewName, auto), [previewName, auto]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
          <TagIcon className="w-6 h-6 text-primary" /> แท็กลูกค้า
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          จัดการแท็ก ตั้งคำสั่ง AI ต่อแท็ก และกฎติด tag อัตโนมัติจากชื่อ/สถานะ
        </p>
      </div>

      <Tabs defaultValue="manage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manage" className="gap-1.5"><TagIcon className="w-3.5 h-3.5"/> จัดการแท็ก</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Sparkles className="w-3.5 h-3.5"/> คำสั่ง AI ต่อแท็ก</TabsTrigger>
          <TabsTrigger value="auto" className="gap-1.5"><Wand2 className="w-3.5 h-3.5"/> กฎอัตโนมัติ</TabsTrigger>
        </TabsList>

        {/* Manage */}
        <TabsContent value="manage" className="space-y-4 mt-0">
          <div className="flex justify-end">
            <Button onClick={() => setEditing({ color: "#94a3b8", sort_order: 0 })} className="gap-1"><Plus className="w-4 h-4"/> เพิ่มแท็ก</Button>
          </div>
          {loading ? <div className="text-center text-muted-foreground py-10">กำลังโหลด...</div>
            : tags.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">ยังไม่มีแท็ก — กดปุ่ม "เพิ่มแท็ก" เพื่อเริ่ม</CardContent></Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {tags.map((t) => (
                  <Card key={t.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Badge style={{ backgroundColor: t.color, color: "#fff" }} className="text-sm px-2.5 py-1 border-0">{t.name}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Users className="w-3 h-3"/> {counts[t.name] || 0}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(t)}><Pencil className="w-3.5 h-3.5"/></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(t)}><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                      {t.ai_tag_instructions && (
                        <div className="flex items-start gap-1.5 text-xs bg-primary/5 text-primary rounded-md p-2">
                          <Sparkles className="w-3 h-3 mt-0.5 shrink-0"/><span className="line-clamp-2">{t.ai_tag_instructions}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>

        {/* AI instructions */}
        <TabsContent value="ai" className="space-y-4 mt-0">
          <Card><CardContent className="p-4 md:p-5">
            <div className="flex items-start gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0"/>
              <p className="text-muted-foreground leading-relaxed">
                เขียนคำสั่งให้ AI ปรับสไตล์ตอบเมื่อเจอลูกค้าที่มีแท็กนี้ — ระบบจะแทรกคำสั่งทั้งหมดของแท็กที่ลูกค้ามี ลงใน prompt อัตโนมัติ
                <br/><span className="text-xs">ตัวอย่าง: "ลูกค้า VIP ให้ใช้ภาษาทางการขึ้น เสนอแพ็กระดับบนก่อน"</span>
              </p>
            </div>
          </CardContent></Card>
          {loading ? <div className="text-center text-muted-foreground py-10">กำลังโหลด...</div>
           : tags.length === 0 ? (
             <Card><CardContent className="py-12 text-center text-muted-foreground">ยังไม่มีแท็ก — ไปที่แท็บ "จัดการแท็ก" เพื่อสร้างก่อน</CardContent></Card>
           ) : (
             <div className="space-y-3">
               {tags.map((t) => {
                 const draft = aiDrafts[t.id];
                 const current = draft ?? t.ai_tag_instructions ?? "";
                 const dirty = draft !== undefined && draft !== (t.ai_tag_instructions ?? "");
                 return (
                   <Card key={t.id}>
                     <CardContent className="p-4 grid gap-3 md:grid-cols-[180px_1fr] md:gap-4">
                       <div className="flex md:flex-col items-start gap-2 md:gap-1.5">
                         <Badge style={{ backgroundColor: t.color, color: "#fff" }} className="text-sm px-2.5 py-1 border-0 w-fit">{t.name}</Badge>
                         <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3"/> {counts[t.name] || 0} ลูกค้า</span>
                       </div>
                       <div className="space-y-2">
                         <Textarea value={current} onChange={(e) => setAiDrafts(p => ({ ...p, [t.id]: e.target.value }))}
                                   placeholder="ยังไม่มีคำสั่ง — AI จะใช้สไตล์ปกติ" rows={3} className="resize-y text-sm"/>
                         <div className="flex justify-end">
                           <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || savingAi === t.id}
                                   onClick={() => saveAi(t)} className="gap-1.5 h-8">
                             {savedAi === t.id ? (<><Check className="w-3.5 h-3.5"/> บันทึกแล้ว</>)
                              : savingAi === t.id ? "กำลังบันทึก..." : (<><Save className="w-3.5 h-3.5"/> บันทึก</>)}
                           </Button>
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 );
               })}
             </div>
           )}
        </TabsContent>

        {/* Auto-tag rules */}
        <TabsContent value="auto" className="space-y-4 mt-0">
          {/* Header card with master toggle */}
          <Card>
            <CardContent className="p-4 md:p-5 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2 flex-1 min-w-[240px]">
                <Wand2 className="w-4 h-4 text-primary mt-0.5 shrink-0"/>
                <div>
                  <p className="font-medium text-sm">ติด Tag อัตโนมัติ</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    เมื่อแอดมินแก้ชื่อลูกค้าหรือเปลี่ยนสถานะ — ระบบจะเพิ่ม tag อัตโนมัติ (สะสมไม่ลบของเก่า) ใช้สำหรับ broadcast/marketing
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-enabled" className="text-sm">{auto.enabled ? "เปิด" : "ปิด"}</Label>
                <Switch id="auto-enabled" checked={auto.enabled} onCheckedChange={(v) => patchAuto({ enabled: v })}/>
              </div>
            </CardContent>
          </Card>

          {/* Format settings */}
          <Card>
            <CardContent className="p-4 md:p-5 space-y-4">
              <div>
                <h3 className="font-medium text-sm flex items-center gap-1.5">รูปแบบเดือน / ปี</h3>
                <p className="text-xs text-muted-foreground mt-0.5">เลือกฟอร์แมตที่ใช้กับ tag — เผื่อลูกค้าต่างชาติ</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">รูปแบบเดือน</Label>
                  <Select value={auto.month_format} onValueChange={(v: any) => patchAuto({ month_format: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_th">ย่อไทย — ม.ค., พ.ค.</SelectItem>
                      <SelectItem value="full_th">เต็มไทย — มกราคม, พฤษภาคม</SelectItem>
                      <SelectItem value="short_en">ย่ออังกฤษ — Jan, May</SelectItem>
                      <SelectItem value="full_en">เต็มอังกฤษ — January, May</SelectItem>
                      <SelectItem value="number">ตัวเลข — 01, 05</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">รูปแบบปี</Label>
                  <Select value={auto.year_format} onValueChange={(v: any) => patchAuto({ year_format: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="be">พ.ศ. — 2569</SelectItem>
                      <SelectItem value="ce">ค.ศ. — 2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3"/> ลองพิมพ์ชื่อดูตัวอย่าง tag ที่จะติด</Label>
                <Input value={previewName} onChange={(e) => setPreviewName(e.target.value)} placeholder="เช่น ตัวเล็ก15พค69" className="h-8 text-sm"/>
                <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                  {previewTags.length === 0 ? <span className="text-xs text-muted-foreground italic">ไม่มี tag ที่ตรงเงื่อนไข</span>
                    : previewTags.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status -> Tag mapping */}
          <Card>
            <CardContent className="p-4 md:p-5 space-y-3">
              <div>
                <h3 className="font-medium text-sm">สถานะ → Tag</h3>
                <p className="text-xs text-muted-foreground mt-0.5">เมื่อเปลี่ยนสถานะลูกค้า ให้ติด tag นี้ (เว้นว่าง = ไม่ติด)</p>
              </div>
              <div className="grid gap-2">
                {STATUS_KEYS.map((sk) => (
                  <div key={sk} className="grid grid-cols-[1fr_1.5fr] gap-2 items-center">
                    <div className="text-sm text-muted-foreground truncate">{STATUS_LABEL[sk]}</div>
                    <Input value={auto.status_tag_map[sk] || ""} placeholder="ไม่ติด tag"
                           onChange={(e) => patchAuto({ status_tag_map: { ...auto.status_tag_map, [sk]: e.target.value } })}
                           className="h-8 text-sm"/>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom regex rules (advanced) */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="w-full p-4 md:p-5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors">
                  <div>
                    <h3 className="font-medium text-sm">กฎ regex เพิ่มเติม (ขั้นสูง)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">เผื่อ pattern ในชื่อที่ไม่ใช่เดือน/ปี เช่น "บริษัท", "ทดสอบ"</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? "rotate-180" : ""}`}/>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-4 md:px-5 pb-4 md:pb-5 pt-0 space-y-2">
                  {auto.custom_name_rules.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-2">ยังไม่มีกฎ</p>
                  )}
                  {auto.custom_name_rules.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.5fr_1fr_60px_32px] gap-2 items-center">
                      <Input value={r.pattern} placeholder="regex pattern เช่น บริษัท|บจ\\."
                             onChange={(e) => { const nr = [...auto.custom_name_rules]; nr[i] = { ...r, pattern: e.target.value }; patchAuto({ custom_name_rules: nr }); }}
                             className="h-8 text-xs font-mono"/>
                      <Input value={r.tag} placeholder="ชื่อ tag"
                             onChange={(e) => { const nr = [...auto.custom_name_rules]; nr[i] = { ...r, tag: e.target.value }; patchAuto({ custom_name_rules: nr }); }}
                             className="h-8 text-sm"/>
                      <Input value={r.flags || ""} placeholder="i"
                             onChange={(e) => { const nr = [...auto.custom_name_rules]; nr[i] = { ...r, flags: e.target.value }; patchAuto({ custom_name_rules: nr }); }}
                             className="h-8 text-xs font-mono" title="flags: i = ไม่สนตัวพิมพ์เล็ก/ใหญ่"/>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                              onClick={() => { const nr = auto.custom_name_rules.filter((_, j) => j !== i); patchAuto({ custom_name_rules: nr }); }}>
                        <Trash2 className="w-3.5 h-3.5"/>
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="gap-1 mt-2"
                          onClick={() => patchAuto({ custom_name_rules: [...auto.custom_name_rules, { pattern: "", tag: "", flags: "i" }] })}>
                    <Plus className="w-3.5 h-3.5"/> เพิ่มกฎ
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Actions bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <Button variant="outline" size="sm" onClick={rescan} disabled={rescanning} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin" : ""}`}/>
              {rescanning ? "กำลังสแกน..." : "สแกนลูกค้าเดิมทั้งหมด"}
            </Button>
            <Button onClick={saveAuto} disabled={!autoDirty || savingAuto} className="gap-1.5">
              <Save className="w-3.5 h-3.5"/>{savingAuto ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "แก้ไขแท็ก" : "เพิ่มแท็กใหม่"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">ชื่อแท็ก *</Label>
              <Input value={editing?.name || ""} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} placeholder="เช่น VIP, ลูกค้าซ้ำ, บริษัท"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">สี</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing!, color: c })}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${editing?.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c }}/>
                ))}
                <Input type="color" value={editing?.color || "#94a3b8"} onChange={(e) => setEditing({ ...editing!, color: e.target.value })} className="w-12 h-7 p-0.5 cursor-pointer"/>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">คำอธิบาย (ไม่บังคับ)</Label>
              <Input value={editing?.description || ""} onChange={(e) => setEditing({ ...editing!, description: e.target.value })} placeholder="เช่น ลูกค้าระดับพรีเมียม ยอดซื้อ > 50,000"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ลำดับการแสดง</Label>
              <Input type="number" value={editing?.sort_order ?? 0} onChange={(e) => setEditing({ ...editing!, sort_order: parseInt(e.target.value) || 0 })}/>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1 border-t">
              <Sparkles className="w-3 h-3"/> คำสั่ง AI สำหรับแท็ก ตั้งได้ที่แท็บ "คำสั่ง AI ต่อแท็ก"
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบแท็ก "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>การลบแท็กออกจาก master list จะไม่ได้ลบแท็กออกจากลูกค้าที่เคยติดอยู่ — แต่จะแสดงเป็นสีเทาแทน</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive hover:bg-destructive/90">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Client-side preview that mirrors SQL compute_auto_tags
function computePreview(nickname: string, cfg: AutoTagSettings): string[] {
  if (!cfg.enabled || !nickname) return [];
  const out: string[] = [];
  const months = MONTH_PREVIEW[cfg.month_format] || MONTH_PREVIEW.short_th;

  // Month: full Thai
  const fullTh = MONTH_PREVIEW.full_th;
  let m: number | null = null;
  for (let i = 0; i < 12; i++) if (nickname.includes(fullTh[i])) { m = i + 1; break; }
  if (m === null) {
    const fullEn = MONTH_PREVIEW.full_en;
    for (let i = 0; i < 12; i++) if (new RegExp(fullEn[i], "i").test(nickname)) { m = i + 1; break; }
  }
  if (m === null) {
    const shortPats: [RegExp, number][] = [
      [/มี\.?ค\.?/, 3], [/เม\.?ย\.?/, 4], [/มิ\.?ย\.?/, 6],
      [/ม\.?ค\.?/, 1], [/ก\.?พ\.?/, 2], [/พ\.?ค\.?/, 5],
      [/ก\.?ค\.?/, 7], [/ส\.?ค\.?/, 8], [/ก\.?ย\.?/, 9],
      [/ต\.?ค\.?/, 10], [/พ\.?ย\.?/, 11], [/ธ\.?ค\.?/, 12],
    ];
    for (const [re, n] of shortPats) if (re.test(nickname)) { m = n; break; }
  }
  if (m === null) {
    const shortEn = MONTH_PREVIEW.short_en;
    for (let i = 0; i < 12; i++) if (new RegExp(`(^|[^a-z])${shortEn[i]}([^a-z]|$)`, "i").test(nickname)) { m = i + 1; break; }
  }
  if (m !== null) out.push(months[m - 1]);

  // Year: pick LAST 4-digit; else LAST 2-digit (assume BE 25xx)
  let y: number | null = null;
  const m4all = nickname.match(/\d{4}/g);
  if (m4all && m4all.length) y = parseInt(m4all[m4all.length - 1]);
  else {
    const m2all = nickname.match(/(?<!\d)\d{2}(?!\d)/g);
    if (m2all && m2all.length) y = 2500 + parseInt(m2all[m2all.length - 1]);
  }
  if (y !== null) {
    const be = y > 2400 ? y : y + 543;
    const ce = y > 2400 ? y - 543 : y;
    out.push(cfg.year_format === "ce" ? String(ce) : String(be));
  }

  // Custom rules
  for (const r of cfg.custom_name_rules || []) {
    if (!r.pattern || !r.tag) continue;
    try {
      const re = new RegExp(r.pattern, r.flags || "");
      if (re.test(nickname)) out.push(r.tag);
    } catch {}
  }
  return out;
}
