import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutoSaveDraft, readDraft, clearDraft } from "@/hooks/useDraft";
import DraftBanner, { DraftSavedIndicator } from "@/components/knowledge/DraftBanner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { triggerEmbed } from "@/lib/embed";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Edit2, Trash2, Tag, Package, Sparkles, Loader2, Image as ImageIcon, BookOpen, MessageSquare, X, Film, Copy, FileText, Shield, GraduationCap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ImageUrlsField from "@/components/knowledge/ImageUrlsField";
import VideoUrlsField, { VideoItem } from "@/components/knowledge/VideoUrlsField";
import TierImageField from "@/components/knowledge/TierImageField";
import KBChatTest from "@/components/knowledge/KBChatTest";
import SmartTeachBox from "@/components/knowledge/SmartTeachBox";
import AiRulesTab from "@/components/knowledge/AiRulesTab";
import AiCoachChat from "@/components/ai-delivery/AiCoachChat";

type Pkg = { id?: string; name: string; category: string | null; description: string | null; min_condition: string | null; pricing_tiers: any[]; custom_attributes: any[]; ai_instruction: string | null; notes: string | null; image_urls: string[]; video_urls: VideoItem[]; is_active: boolean; };
type Promo = { id?: string; name: string; description: string | null; applicable_categories: string[]; image_urls: string[]; video_urls: VideoItem[]; is_active: boolean; min_guests: number | null; };
type KB = { id?: string; title: string; content: string; category: string | null; image_urls: string[]; video_urls: VideoItem[]; bundle_image_titles: string[]; status: string; sort_order: number; is_always_include: boolean; };

const blankPkg: Pkg = { name: "", category: "", description: "", min_condition: "", pricing_tiers: [], custom_attributes: [], ai_instruction: "", notes: "", image_urls: [], video_urls: [], is_active: true };
const blankPromo: Promo = { name: "", description: "", applicable_categories: [], image_urls: [], video_urls: [], is_active: true, min_guests: null };
const blankKB: KB = { title: "", content: "", category: "", image_urls: [], video_urls: [], bundle_image_titles: [], status: "active", sort_order: 0, is_always_include: false };

// Auto rebuild AI cache หลัง CRUD — fire-and-forget ไม่บล็อก UI
export const triggerRebuildAiCache = () => {
  supabase.functions.invoke("rebuild-ai-cache").catch((e) => console.warn("[ai-cache rebuild]", e));
};

// เทมเพลตตัวอย่างให้ user แก้ไขแทนการเริ่มจากช่องว่าง
const KB_TEMPLATE = `**คำถามที่ลูกค้ามักถาม:**
(เช่น "มีบริการ XXX ไหม?", "ราคาเท่าไหร่?")

**คำตอบ:**
(ตอบสั้น กระชับ ระบุเงื่อนไข/ราคา/วิธีติดต่อให้ชัด)

**เงื่อนไข/หมายเหตุ:**
- 
- 

📌 คำแนะนำสำหรับ AI: ตอบโดยใช้คำว่า ... และอย่าลืม ...`;

const PKG_DESC_TEMPLATE = `เหมาะสำหรับ: งานบุญ + แขก (เช่น พระ 9 รูป + แขก 30 ท่าน)
สิ่งที่รวมในแพ็ก:
- เมนูอาหาร: ...
- อุปกรณ์: โต๊ะ/เก้าอี้/ผ้าปู/จาน-ชาม
- พนักงานเสิร์ฟ: ... ท่าน
- เวลา: ... ชั่วโมง
จุดเด่น: ...`;

const PKG_AI_INSTRUCTION_TEMPLATE = `- ถ้าลูกค้าถามถึงแพ็กนี้ ให้บอกราคาต่อท่านก่อน แล้วถามจำนวนคนเพื่อสรุปยอด
- ถ้าจำนวนแขกน้อยกว่าขั้นต่ำ ให้แนะนำแพ็กอื่นแทน
- ห้าม...`;

const PROMO_TEMPLATE = `เงื่อนไขโปรโมชั่น:
- ใช้ได้กับ: ...
- ระยะเวลา: ...
- ขั้นต่ำ: ... ท่าน
- ส่วนลด/ของแถม: ...
- หมายเหตุ: ไม่สามารถใช้ร่วมกับโปรอื่น`;

export default function Knowledge() {
  const { data: cats } = useQuery({ queryKey: ["kb-cats"], queryFn: async () => (await supabase.from("knowledge_categories").select("*").order("sort_order")).data ?? [] });
  const catNames = (cats || []).map((c: any) => c.name);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("coach") === "1" ? "coach" : (searchParams.get("tab") || "kb");
  const [tab, setTab] = useState<string>(initialTab);
  const coachAuditId = searchParams.get("auditId");
  const coachAuditLabel = searchParams.get("auditLabel") || undefined;

  const onTabChange = (v: string) => {
    setTab(v);
    if (v !== "coach") {
      const sp = new URLSearchParams(searchParams);
      sp.delete("coach"); sp.delete("auditId"); sp.delete("auditLabel");
      setSearchParams(sp, { replace: true });
    }
  };

  const clearCoachAudit = () => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("auditId"); sp.delete("auditLabel");
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 relative">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">สอน AI</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">พิมพ์อะไรก็ได้ — AI ช่วยจัดเข้าที่ถูกให้</p>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="default" className="shrink-0">
              <MessageSquare className="w-4 h-4"/> ทดสอบ AI
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
            <div className="p-4 pb-2"><h2 className="font-semibold">ทดสอบ AI ตอบลูกค้า</h2>
              <p className="text-xs text-muted-foreground">คุยเหมือนเป็นลูกค้า ดูว่า AI จะตอบอย่างไร</p>
            </div>
            <div className="flex-1 p-4 pt-2 min-h-0"><KBChatTest/></div>
          </SheetContent>
        </Sheet>
      </div>

      <SmartTeachBox categories={catNames} />
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1">
          <TabsTrigger value="kb" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><BookOpen className="w-4 h-4"/><span>ข้อมูลทั่วไป</span></TabsTrigger>
          <TabsTrigger value="categories" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><Tag className="w-4 h-4"/><span>ประเภท</span></TabsTrigger>
          <TabsTrigger value="packages" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><Package className="w-4 h-4"/><span>แพ็คเกจ</span></TabsTrigger>
          <TabsTrigger value="promotions" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><Sparkles className="w-4 h-4"/><span>โปรโมชั่น</span></TabsTrigger>
          <TabsTrigger value="rules" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><Shield className="w-4 h-4"/><span>กฎ AI</span></TabsTrigger>
          <TabsTrigger value="coach" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-xs sm:text-sm"><GraduationCap className="w-4 h-4"/><span>โค้ช AI</span></TabsTrigger>
        </TabsList>
        <TabsContent value="kb" className="mt-4"><KnowledgeBaseTab/></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab/></TabsContent>
        <TabsContent value="packages" className="mt-4"><PackagesTab/></TabsContent>
        <TabsContent value="promotions" className="mt-4"><PromotionsTab/></TabsContent>
        <TabsContent value="rules" className="mt-4"><AiRulesTab/></TabsContent>
        <TabsContent value="coach" className="mt-4">
          <AiCoachChat
            initialAuditId={coachAuditId}
            initialAuditLabel={coachAuditLabel}
            onClearAudit={clearCoachAudit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function PackagesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<Pkg>(blankPkg);
  const { data: pkgs, isLoading } = useQuery({ queryKey: ["packages"], queryFn: async () => (await supabase.from("catering_packages").select("*").order("created_at",{ascending:false})).data ?? [] });
  const { data: cats } = useQuery({ queryKey: ["pkg-cats"], queryFn: async () => (await supabase.from("package_categories").select("*").order("sort_order")).data ?? [] });

  // ---- Draft state ----
  const initialSnapshotRef = useRef<string>("");
  const [draftKey, setDraftKey] = useState<string>("pkg:new");
  const [foundDraft, setFoundDraft] = useState<{ value: Pkg; savedAt: number } | null>(null);
  const isDirty = useMemo(() => JSON.stringify(edit) !== initialSnapshotRef.current, [edit]);
  const { savedAt, clear: clearDraftState } = useAutoSaveDraft<Pkg>(draftKey, edit, open, { isDirty });

  const openWith = (val: Pkg, key: string) => {
    initialSnapshotRef.current = JSON.stringify(val);
    setDraftKey(key);
    const d = readDraft<Pkg>(key);
    if (d && JSON.stringify(d.value) !== initialSnapshotRef.current) setFoundDraft(d);
    else { setFoundDraft(null); if (d) clearDraft(key); }
    setEdit(val);
    setOpen(true);
  };
  const openNew = () => openWith(blankPkg, "pkg:new");
  const openEdit = (p: any) => openWith({ ...p, pricing_tiers: p.pricing_tiers || [], custom_attributes: p.custom_attributes || [], image_urls: p.image_urls || [], video_urls: p.video_urls || [] }, `pkg:${p.id}`);
  const openDuplicate = (p: any) => {
    const { id, created_at, updated_at, ...rest } = p;
    openWith({ ...rest, name: `${p.name} (สำเนา)`, pricing_tiers: structuredClone(p.pricing_tiers || []), custom_attributes: structuredClone(p.custom_attributes || []), image_urls: [...(p.image_urls || [])], video_urls: structuredClone(p.video_urls || []) }, "pkg:new");
  };
  const restoreDraft = () => { if (foundDraft) { setEdit(foundDraft.value); setFoundDraft(null); toast.success("กู้คืนฉบับร่างแล้ว"); } };
  const discardDraft = () => { clearDraft(draftKey); clearDraftState(); setFoundDraft(null); toast("ทิ้งฉบับร่างแล้ว"); };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload: any = { ...edit }; delete payload.created_at; delete payload.updated_at;
      const res = edit.id
        ? await supabase.from("catering_packages").update(payload).eq("id", edit.id).select("id").maybeSingle()
        : await supabase.from("catering_packages").insert(payload).select("id").maybeSingle();
      if (res.error) return toast.error(res.error.message);
      toast.success("บันทึกแล้ว");
      clearDraft(draftKey); clearDraftState();
      setOpen(false); qc.invalidateQueries({queryKey:["packages"]}); triggerRebuildAiCache();
      if (res.data?.id) triggerEmbed("catering_packages", res.data.id);
    } finally { setSaving(false); }
  };
  const del = async (id: string) => { if (!confirm("ลบแพ็คเกจนี้?")) return; await supabase.from("catering_packages").delete().eq("id", id); toast.success("ลบแล้ว"); qc.invalidateQueries({queryKey:["packages"]}); triggerRebuildAiCache(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (edit.name && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, edit]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openNew}><Plus/>เพิ่มแพ็คเกจ</Button></div>
      {isLoading && <Loader2 className="animate-spin mx-auto"/>}
      <div className="grid md:grid-cols-2 gap-4">
        {pkgs?.map((p:any)=>(
          <Card key={p.id} className="p-5 shadow-soft border-border/60 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold break-words">{p.name}</h3>
                {p.category && <Badge variant="secondary" className="mt-1">{p.category}</Badge>}
                {!p.is_active && <Badge variant="outline" className="ml-1">ปิดใช้งาน</Badge>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={()=>openEdit(p)} title="แก้ไข"><Edit2 className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={()=>openDuplicate(p)} title="คัดลอกเป็นแพ็คเกจใหม่"><Copy className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={()=>del(p.id)} title="ลบ"><Trash2 className="w-4 h-4 text-destructive"/></Button>
              </div>
            </div>
            {p.description && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line break-words">{p.description}</p>}

            {p.pricing_tiers?.length > 0 && <p className="text-xs text-muted-foreground mt-3">{p.pricing_tiers.length} ระดับราคา</p>}
            {p.image_urls?.length > 0 && (
              <div className="flex gap-1 mt-3">
                {p.image_urls.slice(0,4).map((u:string,i:number)=>(<img key={i} src={u} className="w-12 h-12 rounded object-cover border" alt=""/>))}
              </div>
            )}
          </Card>
        ))}
        {!isLoading && !pkgs?.length && <Card className="p-10 text-center md:col-span-2"><Package className="w-10 h-10 mx-auto text-muted-foreground mb-2"/><p className="text-sm text-muted-foreground">ยังไม่มีแพ็คเกจ — กดเพิ่มแพ็คเกจเพื่อเริ่มสอน AI</p></Card>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6"><DialogTitle>{edit.id?"แก้ไขแพ็คเกจ":"เพิ่มแพ็คเกจ"}</DialogTitle></DialogHeader>
          <div className="space-y-4 px-6 pt-2 pb-4">
            {foundDraft && <DraftBanner savedAt={foundDraft.savedAt} onRestore={restoreDraft} onDiscard={discardDraft}/>}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>ชื่อแพ็คเกจ *</Label><Input value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div>
              <div className="space-y-1.5">
                <Label>ประเภท</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={edit.category||""} onChange={e=>setEdit({...edit,category:e.target.value})}>
                  <option value="">— เลือก —</option>
                  {cats?.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>รายละเอียด</Label>{!edit.description && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>setEdit({...edit,description:PKG_DESC_TEMPLATE})}><FileText className="w-3 h-3"/>ใช้เทมเพลตตัวอย่าง</Button>}</div><Textarea rows={4} value={edit.description||""} onChange={e=>setEdit({...edit,description:e.target.value})}/></div>
            <div className="space-y-1.5"><Label>เงื่อนไขขั้นต่ำ</Label><Input value={edit.min_condition||""} onChange={e=>setEdit({...edit,min_condition:e.target.value})}/></div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>ระดับราคา (Pricing Tiers)</Label>
                <Button type="button" size="sm" variant="outline" onClick={()=>setEdit({...edit,pricing_tiers:[...edit.pricing_tiers,{tier_name:"",total_pax:"",monk_pax:"",price:""}]})}><Plus className="w-3 h-3"/>เพิ่ม</Button>
              </div>
              {edit.pricing_tiers.length > 0 && (
                <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_56px_auto] gap-2 text-xs text-muted-foreground px-1">
                  <span>ชื่อ tier</span><span>คนทั้งหมด</span><span>จำนวนพระ</span><span>ราคา (฿)</span><span>รูป</span><span/>
                </div>
              )}
              {edit.pricing_tiers.map((t,i)=>{
                const total = Number(t.total_pax)||0, monk = Number(t.monk_pax)||0;
                const guest = total - monk;
                const qLevels: any[] = Array.isArray(t.quality_levels) ? t.quality_levels : [];
                const updateTier = (patch:any) => { const n=[...edit.pricing_tiers]; n[i]={...n[i],...patch}; setEdit({...edit,pricing_tiers:n}); };
                const updateQL = (qi:number, patch:any) => { const nq=[...qLevels]; nq[qi]={...nq[qi],...patch}; updateTier({quality_levels:nq}); };
                return (
                  <div key={i} className="space-y-1 border border-border/40 rounded-lg p-2">
                    <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_56px_auto] gap-2 items-center">
                      <Input placeholder="เช่น Standard, ยอดนิยม" value={t.tier_name||""} onChange={e=>updateTier({tier_name:e.target.value})}/>
                      <Input type="number" placeholder="40" value={t.total_pax||""} onChange={e=>updateTier({total_pax:e.target.value})}/>
                      <Input type="number" placeholder="9" value={t.monk_pax||""} onChange={e=>updateTier({monk_pax:e.target.value})}/>
                      <Input type="number" placeholder="30000" value={t.price||""} onChange={e=>updateTier({price:e.target.value})} disabled={qLevels.length>0}/>
                      <TierImageField url={t.image_url} onChange={(v)=>updateTier({image_url:v})}/>
                      <Button size="icon" variant="ghost" onClick={()=>setEdit({...edit,pricing_tiers:edit.pricing_tiers.filter((_,j)=>j!==i)})}><X className="w-4 h-4"/></Button>
                    </div>
                    {total > 0 && monk > 0 && (
                      <p className="text-xs text-muted-foreground px-1">→ พระ {monk} + แขก {guest} = {total} ท่าน{qLevels.length>0 && " · ใช้ราคาจากระดับคุณภาพด้านล่าง"}</p>
                    )}

                    <div className="pl-3 pt-1 space-y-1.5 border-l-2 border-primary/30 ml-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">ระดับคุณภาพ (เช่น Standard / Premium / Elite)</span>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={()=>updateTier({quality_levels:[...qLevels,{name:"",price:"",image_url:"",highlights:""}]})}><Plus className="w-3 h-3"/>เพิ่มระดับ</Button>
                      </div>
                      {qLevels.map((q,qi)=>(
                        <div key={qi} className="grid grid-cols-[1fr_0.8fr_1.5fr_56px_auto] gap-2 items-start">
                          <Input placeholder="Standard" value={q.name||""} onChange={e=>updateQL(qi,{name:e.target.value})}/>
                          <Input type="number" placeholder="30000" value={q.price||""} onChange={e=>updateQL(qi,{price:e.target.value})}/>
                          <Input placeholder="จุดเด่น เช่น เนื้อปู หูฉลาม" value={q.highlights||""} onChange={e=>updateQL(qi,{highlights:e.target.value})}/>
                          <TierImageField url={q.image_url} onChange={(v)=>updateQL(qi,{image_url:v})}/>
                          <Button size="icon" variant="ghost" onClick={()=>updateTier({quality_levels:qLevels.filter((_,j)=>j!==qi)})}><X className="w-4 h-4"/></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>ข้อมูลเพิ่มเติม (Key-Value)</Label>
                <Button type="button" size="sm" variant="outline" onClick={()=>setEdit({...edit,custom_attributes:[...edit.custom_attributes,{label:"",value:""}]})}><Plus className="w-3 h-3"/>เพิ่ม</Button>
              </div>
              {edit.custom_attributes.map((a,i)=>(
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input placeholder="หัวข้อ" value={a.label||""} onChange={e=>{const n=[...edit.custom_attributes];n[i]={...n[i],label:e.target.value};setEdit({...edit,custom_attributes:n});}}/>
                  <Input placeholder="ค่า" value={a.value||""} onChange={e=>{const n=[...edit.custom_attributes];n[i]={...n[i],value:e.target.value};setEdit({...edit,custom_attributes:n});}}/>
                  <Button size="icon" variant="ghost" onClick={()=>setEdit({...edit,custom_attributes:edit.custom_attributes.filter((_,j)=>j!==i)})}><X className="w-4 h-4"/></Button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>คำสั่งสำหรับ AI (AI Instruction)</Label>{!edit.ai_instruction && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>setEdit({...edit,ai_instruction:PKG_AI_INSTRUCTION_TEMPLATE})}><FileText className="w-3 h-3"/>ใช้เทมเพลตตัวอย่าง</Button>}</div><Textarea rows={3} value={edit.ai_instruction||""} onChange={e=>setEdit({...edit,ai_instruction:e.target.value})} placeholder="เช่น: ถ้าลูกค้าถามเรื่องโต๊ะจีน ให้แนะนำเกรด A ก่อน"/></div>
            <div className="space-y-1.5"><Label>หมายเหตุ</Label><Textarea rows={2} value={edit.notes||""} onChange={e=>setEdit({...edit,notes:e.target.value})}/></div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4"/>รูปภาพ (URL)</Label><ImageUrlsField urls={edit.image_urls} onChange={u=>setEdit({...edit,image_urls:u})}/></div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Film className="w-4 h-4"/>วิดีโอ</Label><VideoUrlsField videos={edit.video_urls} onChange={v=>setEdit({...edit,video_urls:v})}/></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <Label>เปิดใช้งาน</Label>
              <Switch checked={edit.is_active} onCheckedChange={v=>setEdit({...edit,is_active:v})}/>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-3 gap-2 sm:gap-2 flex-row items-center">
            <DraftSavedIndicator savedAt={savedAt}/>
            <Button variant="outline" onClick={()=>setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={!edit.name || saving} title="Ctrl/Cmd + S">{saving ? "กำลังบันทึก…" : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: cats } = useQuery({ queryKey: ["pkg-cats"], queryFn: async () => (await supabase.from("package_categories").select("*").order("sort_order")).data ?? [] });
  const add = async () => { const v = name.trim(); if(!v) { toast.error("กรอกชื่อประเภทก่อน"); return; } const { error } = await supabase.from("package_categories").insert({ name: v, sort_order: (cats?.length||0)+1 }); if(error) toast.error(error.message); else { toast.success("เพิ่มแล้ว"); setName(""); qc.invalidateQueries({queryKey:["pkg-cats"]}); } };
  const del = async (id:string) => { await supabase.from("package_categories").delete().eq("id",id); qc.invalidateQueries({queryKey:["pkg-cats"]}); };
  return (
    <Card className="p-6 shadow-soft border-border/60 max-w-xl">
      <div className="flex gap-2 mb-4">
        <Input placeholder="เช่น งานบุญ, โต๊ะจีน, ค็อกเทล" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}/>
        <Button onClick={add}><Plus/></Button>
      </div>
      <div className="space-y-2">
        {cats?.map((c:any)=>(
          <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <span>{c.name}</span>
            <Button size="icon" variant="ghost" onClick={()=>del(c.id)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
          </div>
        ))}
        {!cats?.length && <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีประเภท</p>}
      </div>
    </Card>
  );
}

function PromotionsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<Promo>(blankPromo);
  const { data: promos } = useQuery({ queryKey:["promos"], queryFn: async()=>(await supabase.from("promotions").select("*").order("created_at",{ascending:false})).data ?? [] });
  const { data: cats } = useQuery({ queryKey:["pkg-cats"], queryFn: async()=>(await supabase.from("package_categories").select("*").order("sort_order")).data ?? [] });

  const initialSnapshotRef = useRef<string>("");
  const [draftKey, setDraftKey] = useState<string>("promo:new");
  const [foundDraft, setFoundDraft] = useState<{ value: Promo; savedAt: number } | null>(null);
  const isDirty = useMemo(() => JSON.stringify(edit) !== initialSnapshotRef.current, [edit]);
  const { savedAt, clear: clearDraftState } = useAutoSaveDraft<Promo>(draftKey, edit, open, { isDirty });

  const openWith = (val: Promo, key: string) => {
    initialSnapshotRef.current = JSON.stringify(val);
    setDraftKey(key);
    const d = readDraft<Promo>(key);
    if (d && JSON.stringify(d.value) !== initialSnapshotRef.current) setFoundDraft(d);
    else { setFoundDraft(null); if (d) clearDraft(key); }
    setEdit(val);
    setOpen(true);
  };
  const openNew = () => openWith(blankPromo, "promo:new");
  const openEdit = (p: any) => openWith({ ...p, applicable_categories: p.applicable_categories||[], image_urls: p.image_urls||[], video_urls: p.video_urls||[] }, `promo:${p.id}`);
  const openDuplicate = (p: any) => { const {id,created_at,updated_at,...rest}=p; openWith({...rest,name:`${p.name} (สำเนา)`,applicable_categories:[...(p.applicable_categories||[])],image_urls:[...(p.image_urls||[])],video_urls:structuredClone(p.video_urls||[])}, "promo:new"); };
  const restoreDraft = () => { if (foundDraft) { setEdit(foundDraft.value); setFoundDraft(null); toast.success("กู้คืนฉบับร่างแล้ว"); } };
  const discardDraft = () => { clearDraft(draftKey); clearDraftState(); setFoundDraft(null); toast("ทิ้งฉบับร่างแล้ว"); };

  const save = async () => {
    const payload:any = {...edit}; delete payload.created_at; delete payload.updated_at;
    const res = edit.id
      ? await supabase.from("promotions").update(payload).eq("id",edit.id).select("id").maybeSingle()
      : await supabase.from("promotions").insert(payload).select("id").maybeSingle();
    if(res.error) return toast.error(res.error.message);
    toast.success("บันทึกแล้ว");
    clearDraft(draftKey); clearDraftState();
    setOpen(false); qc.invalidateQueries({queryKey:["promos"]}); triggerRebuildAiCache();
    if (res.data?.id) triggerEmbed("promotions", res.data.id);
  };
  const del = async (id:string) => { if(!confirm("ลบ?")) return; await supabase.from("promotions").delete().eq("id",id); qc.invalidateQueries({queryKey:["promos"]}); triggerRebuildAiCache(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (edit.name) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, edit]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openNew}><Plus/>เพิ่มโปรโมชั่น</Button></div>
      <div className="grid md:grid-cols-2 gap-4">
        {promos?.map((p:any)=>(
          <Card key={p.id} className="p-5 shadow-soft border-border/60 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-display font-semibold">{p.name}</h3>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.applicable_categories?.map((c:string)=>(<Badge key={c} variant="secondary">{c}</Badge>))}
                  {p.min_guests != null && <Badge variant="outline">ขั้นต่ำ {p.min_guests} ท่าน</Badge>}
                </div>
                {p.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{p.description}</p>}
              </div>
              <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>openEdit(p)} title="แก้ไข"><Edit2 className="w-4 h-4"/></Button><Button size="icon" variant="ghost" onClick={()=>openDuplicate(p)} title="คัดลอก"><Copy className="w-4 h-4"/></Button><Button size="icon" variant="ghost" onClick={()=>del(p.id)} title="ลบ"><Trash2 className="w-4 h-4 text-destructive"/></Button></div>
            </div>
          </Card>
        ))}
        {!promos?.length && <Card className="p-10 text-center md:col-span-2"><Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-2"/><p className="text-sm text-muted-foreground">ยังไม่มีโปรโมชั่น</p></Card>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6"><DialogTitle>{edit.id?"แก้ไขโปรโมชั่น":"เพิ่มโปรโมชั่น"}</DialogTitle></DialogHeader>
          <div className="space-y-4 px-6 pt-2 pb-4">
            {foundDraft && <DraftBanner savedAt={foundDraft.savedAt} onRestore={restoreDraft} onDiscard={discardDraft}/>}
            <div className="space-y-1.5"><Label>ชื่อ *</Label><Input value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>รายละเอียด</Label>{!edit.description && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>setEdit({...edit,description:PROMO_TEMPLATE})}><FileText className="w-3 h-3"/>ใช้เทมเพลตตัวอย่าง</Button>}</div><Textarea rows={3} value={edit.description||""} onChange={e=>setEdit({...edit,description:e.target.value})}/></div>
            <div className="space-y-1.5">
              <Label>ใช้กับประเภท</Label>
              <div className="flex flex-wrap gap-2">
                {cats?.map((c:any)=>{
                  const on = edit.applicable_categories.includes(c.name);
                  return <button key={c.id} type="button" onClick={()=>setEdit({...edit,applicable_categories: on ? edit.applicable_categories.filter(x=>x!==c.name) : [...edit.applicable_categories,c.name]})} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on?"bg-primary text-primary-foreground border-primary":"bg-background hover:bg-muted"}`}>{c.name}</button>;
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>จำนวนท่านขั้นต่ำ (ถ้ามี)</Label>
              <Input type="number" min={1} value={edit.min_guests ?? ""} onChange={e=>setEdit({...edit,min_guests: e.target.value === "" ? null : +e.target.value})} placeholder="เว้นว่าง = ใช้ได้ทุกขนาดงาน"/>
              <p className="text-xs text-muted-foreground">ลูกค้าต้องมีจำนวนแขกอย่างน้อยเท่านี้ AI ถึงจะเสนอโปรนี้</p>
            </div>
            <div className="space-y-1.5"><Label>รูปภาพ</Label><ImageUrlsField urls={edit.image_urls} onChange={u=>setEdit({...edit,image_urls:u})}/></div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Film className="w-4 h-4"/>วิดีโอ</Label><VideoUrlsField videos={edit.video_urls} onChange={v=>setEdit({...edit,video_urls:v})}/></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted"><Label>เปิดใช้งาน</Label><Switch checked={edit.is_active} onCheckedChange={v=>setEdit({...edit,is_active:v})}/></div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-3 gap-2 sm:gap-2 flex-row items-center">
            <DraftSavedIndicator savedAt={savedAt}/>
            <Button variant="outline" onClick={()=>setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={!edit.name} title="Ctrl/Cmd + S">บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KnowledgeBaseTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<KB>(blankKB);
  const [filterCat, setFilterCat] = useState<string>("__all");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<'rule' | 'nocat' | 'delete' | null>(null);
  const [delTargetId, setDelTargetId] = useState<string | null>(null);
  const ruleAckedRef = useRef(false);
  const noCatAckedRef = useRef(false);

  // ---- Draft state ----
  const initialSnapshotRef = useRef<string>(""); // JSON of edit at open time
  const [draftKey, setDraftKey] = useState<string>("kb:new");
  const [foundDraft, setFoundDraft] = useState<{ value: KB; savedAt: number } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(edit) !== initialSnapshotRef.current, [edit]);
  const { savedAt, clear: clearDraftState } = useAutoSaveDraft<KB>(draftKey, edit, open, { isDirty });

  const resetAcks = () => { ruleAckedRef.current = false; noCatAckedRef.current = false; };

  const { data: items, isLoading } = useQuery({
    queryKey: ["kb"],
    queryFn: async () => (await supabase.from("knowledge_base").select("*").order("sort_order")).data ?? [],
  });
  const { data: cats } = useQuery({
    queryKey: ["kb-cats"],
    queryFn: async () => (await supabase.from("knowledge_categories").select("*").order("sort_order").order("name")).data ?? [],
  });

  const openWith = (val: KB, key: string) => {
    resetAcks();
    initialSnapshotRef.current = JSON.stringify(val);
    setDraftKey(key);
    const d = readDraft<KB>(key);
    // Only offer draft if it actually differs from the base value
    if (d && JSON.stringify(d.value) !== initialSnapshotRef.current) {
      setFoundDraft(d);
    } else {
      setFoundDraft(null);
      if (d) clearDraft(key);
    }
    setEdit(val);
    setOpen(true);
  };

  const openNew = () => openWith(blankKB, "kb:new");
  const openEdit = (i: any) => openWith(
    { ...i, image_urls: i.image_urls || [], video_urls: i.video_urls || [], bundle_image_titles: i.bundle_image_titles || [] },
    `kb:${i.id}`
  );
  const openDuplicate = (i: any) => {
    const { id, created_at, updated_at, ...rest } = i;
    openWith(
      { ...rest, title: `${i.title} (สำเนา)`, image_urls: [...(i.image_urls || [])], video_urls: structuredClone(i.video_urls || []), bundle_image_titles: [...(i.bundle_image_titles || [])] },
      "kb:new"
    );
  };

  const restoreDraft = () => { if (foundDraft) { setEdit(foundDraft.value); setFoundDraft(null); toast.success("กู้คืนฉบับร่างแล้ว"); } };
  const discardDraft = () => { clearDraft(draftKey); clearDraftState(); setFoundDraft(null); toast("ทิ้งฉบับร่างแล้ว"); };

  const save = async () => {
    const c = (edit.content || "").trim();
    const ruleHints = /(^|\n)\s*(ห้าม|ต้อง|อย่า|ใช้คำว่า|ใช้คำ|ไม่ควร|ควรใช้|ต้องตอบ|ห้ามตอบ|ห้ามพูด|ห้ามใช้)/;
    const looksLikeRule = c.length < 400 && ruleHints.test(c);
    if (looksLikeRule && !ruleAckedRef.current) {
      setAlertType('rule'); setAlertOpen(true); return;
    }
    const noCategory = !edit.category || String(edit.category).trim() === "";
    if (noCategory && !noCatAckedRef.current) {
      setAlertType('nocat'); setAlertOpen(true); return;
    }
    const payload: any = { ...edit, category: noCategory ? null : edit.category };
    delete payload.created_at; delete payload.updated_at; delete payload.tags;
    const res = edit.id
      ? await supabase.from("knowledge_base").update(payload).eq("id", edit.id).select("id").maybeSingle()
      : await supabase.from("knowledge_base").insert(payload).select("id").maybeSingle();
    if (res.error) return toast.error(res.error.message);
    toast.success("บันทึกแล้ว");
    clearDraft(draftKey); clearDraftState();
    setOpen(false); resetAcks(); qc.invalidateQueries({ queryKey: ["kb"] }); triggerRebuildAiCache();
    if (res.data?.id) triggerEmbed("knowledge_base", res.data.id);
  };

  // Cmd/Ctrl+S to save while dialog open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (edit.title) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, edit]);

  const handleAlertConfirm = () => {
    setAlertOpen(false);
    if (alertType === 'rule') { ruleAckedRef.current = true; save(); return; }
    if (alertType === 'nocat') { noCatAckedRef.current = true; save(); return; }
    if (alertType === 'delete' && delTargetId) {
      supabase.from("knowledge_base").delete().eq("id", delTargetId).then(() => {
        toast.success("ลบแล้ว"); qc.invalidateQueries({ queryKey: ["kb"] }); triggerRebuildAiCache();
      });
      return;
    }
  };

  const del = (id: string) => { setDelTargetId(id); setAlertType('delete'); setAlertOpen(true); };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const exists = (cats || []).some((c: any) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) { toast.error("มีหมวดนี้อยู่แล้ว"); return; }
    const { error } = await supabase.from("knowledge_categories").insert({ name });
    if (error) return toast.error(error.message);
    toast.success("เพิ่มหมวดแล้ว");
    setEdit({ ...edit, category: name });
    setNewCatName(""); setNewCatOpen(false);
    qc.invalidateQueries({ queryKey: ["kb-cats"] });
  };

  const filtered = (items || []).filter((i: any) =>
    filterCat === "__all" ? true : filterCat === "__none" ? !i.category : i.category === filterCat
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm">หมวด:</Label>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[200px]"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">ทั้งหมด ({items?.length || 0})</SelectItem>
              <SelectItem value="__none">ไม่ระบุหมวด</SelectItem>
              {(cats || []).map((c: any) => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew}><Plus/>เพิ่มข้อมูล</Button>
      </div>
      {isLoading && <Loader2 className="animate-spin mx-auto"/>}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((i: any) => (
          <Card key={i.id} className="p-5 shadow-soft border-border/60 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold truncate">{i.title}</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {i.category && <Badge variant="secondary">{i.category}</Badge>}
                  {i.is_always_include && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">📌 ทุกครั้ง</Badge>}
                  {i.status !== "active" && <Badge variant="outline">ปิดใช้งาน</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(i)} title="แก้ไข"><Edit2 className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={() => openDuplicate(i)} title="คัดลอก"><Copy className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={() => del(i.id)} title="ลบ"><Trash2 className="w-4 h-4 text-destructive"/></Button>
              </div>
            </div>
            {i.content && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line break-words">{i.content}</p>}
            {i.image_urls?.length > 0 && (
              <div className="flex gap-1 mt-3">
                {i.image_urls.slice(0, 4).map((u: string, k: number) => (
                  <img key={k} src={u} className="w-12 h-12 rounded object-cover border" alt=""/>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!isLoading && !filtered.length && (
          <Card className="p-10 text-center md:col-span-2">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-2"/>
            <p className="text-sm text-muted-foreground">
              {items?.length ? "ไม่มีข้อมูลในหมวดนี้" : "ยังไม่มีข้อมูล — เพิ่ม FAQ หรือข้อมูลทั่วไปสำหรับ AI"}
            </p>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAcks(); setOpen(v); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6"><DialogTitle>{edit.id ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}</DialogTitle></DialogHeader>
          <div className="space-y-4 px-6 pt-2 pb-4">
            {foundDraft && (
              <DraftBanner savedAt={foundDraft.savedAt} onRestore={restoreDraft} onDiscard={discardDraft}/>
            )}
            <div className="space-y-1.5"><Label>หัวข้อ *</Label>
              <Input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}/>
            </div>
            <div className="space-y-1.5"><Label>หมวดหมู่</Label>
              {newCatOpen ? (
                <div className="flex gap-2">
                  <Input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                    placeholder="ชื่อหมวดใหม่"/>
                  <Button type="button" size="sm" onClick={addCategory}>เพิ่ม</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setNewCatOpen(false); setNewCatName(""); }}>
                    <X className="w-4 h-4"/>
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={edit.category || "__none"} onValueChange={v => setEdit({ ...edit, category: v === "__none" ? null : v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="เลือกหมวด"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— ไม่ระบุ —</SelectItem>
                      {(cats || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setNewCatOpen(true)}>
                    <Plus className="w-4 h-4"/>เพิ่มหมวด
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>เนื้อหา</Label>{!edit.content && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>setEdit({...edit,content:KB_TEMPLATE})}><FileText className="w-3 h-3"/>ใช้เทมเพลตตัวอย่าง</Button>}</div>
              <Textarea rows={6} value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })}
                placeholder="ใส่ข้อมูล/คำถาม/คำตอบที่ AI ต้องรู้"/>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4"/>รูปภาพ</Label>
              <ImageUrlsField urls={edit.image_urls} onChange={u => setEdit({ ...edit, image_urls: u })}/>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Film className="w-4 h-4"/>วิดีโอ</Label>
              <VideoUrlsField videos={edit.video_urls} onChange={v => setEdit({ ...edit, video_urls: v })}/>
            </div>
            <div className="space-y-1.5">
              <Label>แนบรูปอื่นไปด้วยอัตโนมัติ (Bundle)</Label>
              <p className="text-[11px] text-muted-foreground">เมื่อ AI เลือกหัวข้อนี้ ระบบจะแนบรูปจากหัวข้อต่อไปนี้ไปด้วย เหมาะกับ KB "เปรียบเทียบ" ที่อยากส่งเมนูทั้ง 3 tier พร้อมกัน</p>
              <Select value="" onValueChange={v => {
                if (v && !edit.bundle_image_titles.includes(v)) setEdit({ ...edit, bundle_image_titles: [...edit.bundle_image_titles, v] });
              }}>
                <SelectTrigger><SelectValue placeholder="+ เพิ่มหัวข้อที่จะแนบไปด้วย"/></SelectTrigger>
                <SelectContent>
                  {(items || []).filter((x: any) => x.id !== edit.id && x.title !== edit.title && !edit.bundle_image_titles.includes(x.title)).map((x: any) => (
                    <SelectItem key={x.id} value={x.title}>{x.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {edit.bundle_image_titles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {edit.bundle_image_titles.map(t => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">
                      {t}
                      <button type="button" onClick={() => setEdit({ ...edit, bundle_image_titles: edit.bundle_image_titles.filter(x => x !== t) })}
                        className="hover:bg-destructive/20 rounded px-0.5"><X className="w-3 h-3"/></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="space-y-0.5">
                <Label>📌 ส่งให้ AI ทุกครั้ง</Label>
                <p className="text-[11px] text-muted-foreground">เปิดถ้าข้อมูลนี้สำคัญมาก AI ต้องรู้ตลอดเวลา</p>
              </div>
              <Switch checked={!!edit.is_always_include}
                onCheckedChange={v => setEdit({ ...edit, is_always_include: v })}/>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <Label>เปิดใช้งาน</Label>
              <Switch checked={edit.status === "active"}
                onCheckedChange={v => setEdit({ ...edit, status: v ? "active" : "inactive" })}/>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-3 gap-2 sm:gap-2 flex-row items-center">
            <DraftSavedIndicator savedAt={savedAt}/>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={!edit.title} title="Ctrl/Cmd + S">บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alertType === 'rule' && "ดูเหมือนกำลังใส่ 'กฎการตอบ'"}
              {alertType === 'nocat' && "ยังไม่ได้เลือกหมวด"}
              {alertType === 'delete' && "ยืนยันการลบ"}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {alertType === 'rule' &&
                "เนื้อหานี้ดูเหมือน 'กฎการตอบ' (ห้าม/ต้อง/ใช้คำว่า…) ไม่ใช่ข้อมูลตอบลูกค้า\n\n" +
                "กฎควรใส่ที่: ตั้งค่าระบบ → กฎ AI (จะถูกใช้ทุกครั้ง สม่ำเสมอกว่า)\n" +
                "ฐานความรู้ออกแบบเพื่อ 'ข้อมูลที่ลูกค้าถาม' (เมนู ราคา รีวิว FAQ)\n\n" +
                "ต้องการบันทึกใส่ KB ต่อหรือไม่?"}
              {alertType === 'nocat' &&
                "ยังไม่ได้เลือกหมวด จะบันทึกเป็น 'ไม่มีหมวด' ใช่ไหม?\n\nกด บันทึก = บันทึกต่อ / กด ยกเลิก = กลับไปเลือกหมวด"}
              {alertType === 'delete' && "ลบรายการนี้? การลบไม่สามารถเรียกคืนได้"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setAlertOpen(false); }}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleAlertConfirm}>{alertType === 'delete' ? "ลบ" : "บันทึก"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
