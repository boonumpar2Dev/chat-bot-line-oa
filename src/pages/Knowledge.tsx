import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Edit2, Trash2, Tag, Package, Sparkles, Loader2, Image as ImageIcon, BookOpen, MessageSquare, X, Film } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ImageUrlsField from "@/components/knowledge/ImageUrlsField";
import VideoUrlsField, { VideoItem } from "@/components/knowledge/VideoUrlsField";
import TierImageField from "@/components/knowledge/TierImageField";
import KBChatTest from "@/components/knowledge/KBChatTest";

type Pkg = { id?: string; name: string; category: string | null; description: string | null; min_condition: string | null; pricing_tiers: any[]; custom_attributes: any[]; ai_instruction: string | null; notes: string | null; image_urls: string[]; video_urls: VideoItem[]; is_active: boolean; };
type Promo = { id?: string; name: string; description: string | null; applicable_categories: string[]; image_urls: string[]; video_urls: VideoItem[]; is_active: boolean; min_guests: number | null; };
type KB = { id?: string; title: string; content: string; category: string | null; image_urls: string[]; video_urls: VideoItem[]; status: string; sort_order: number; };

const blankPkg: Pkg = { name: "", category: "", description: "", min_condition: "", pricing_tiers: [], custom_attributes: [], ai_instruction: "", notes: "", image_urls: [], video_urls: [], is_active: true };
const blankPromo: Promo = { name: "", description: "", applicable_categories: [], image_urls: [], video_urls: [], is_active: true, min_guests: null };
const blankKB: KB = { title: "", content: "", category: "", image_urls: [], video_urls: [], status: "active", sort_order: 0 };

export default function Knowledge() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 relative">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">สอน AI</h1>
          <p className="text-muted-foreground mt-1">จัดการข้อมูลที่ AI ใช้ตอบลูกค้า + ทดสอบได้ทันที</p>
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
      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages"><Package className="w-4 h-4 mr-1.5"/>แพ็คเกจ</TabsTrigger>
          <TabsTrigger value="categories"><Tag className="w-4 h-4 mr-1.5"/>ประเภท</TabsTrigger>
          <TabsTrigger value="promotions"><Sparkles className="w-4 h-4 mr-1.5"/>โปรโมชั่น</TabsTrigger>
          <TabsTrigger value="kb"><BookOpen className="w-4 h-4 mr-1.5"/>ข้อมูลทั่วไป</TabsTrigger>
        </TabsList>
        <TabsContent value="packages" className="mt-4"><PackagesTab/></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab/></TabsContent>
        <TabsContent value="promotions" className="mt-4"><PromotionsTab/></TabsContent>
        <TabsContent value="kb" className="mt-4"><KnowledgeBaseTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function PackagesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Pkg>(blankPkg);
  const { data: pkgs, isLoading } = useQuery({ queryKey: ["packages"], queryFn: async () => (await supabase.from("catering_packages").select("*").order("created_at",{ascending:false})).data ?? [] });
  const { data: cats } = useQuery({ queryKey: ["pkg-cats"], queryFn: async () => (await supabase.from("package_categories").select("*").order("sort_order")).data ?? [] });

  const openNew = () => { setEdit(blankPkg); setOpen(true); };
  const openEdit = (p: any) => { setEdit({ ...p, pricing_tiers: p.pricing_tiers || [], custom_attributes: p.custom_attributes || [], image_urls: p.image_urls || [], video_urls: p.video_urls || [] }); setOpen(true); };
  const save = async () => {
    const payload: any = { ...edit }; delete payload.created_at; delete payload.updated_at;
    const res = edit.id ? await supabase.from("catering_packages").update(payload).eq("id", edit.id) : await supabase.from("catering_packages").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("บันทึกแล้ว"); setOpen(false); qc.invalidateQueries({queryKey:["packages"]});
  };
  const del = async (id: string) => { if (!confirm("ลบแพ็คเกจนี้?")) return; await supabase.from("catering_packages").delete().eq("id", id); toast.success("ลบแล้ว"); qc.invalidateQueries({queryKey:["packages"]}); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openNew}><Plus/>เพิ่มแพ็คเกจ</Button></div>
      {isLoading && <Loader2 className="animate-spin mx-auto"/>}
      <div className="grid md:grid-cols-2 gap-4">
        {pkgs?.map((p:any)=>(
          <Card key={p.id} className="p-5 shadow-soft border-border/60">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-display font-semibold">{p.name}</h3>
                {p.category && <Badge variant="secondary" className="mt-1">{p.category}</Badge>}
                {!p.is_active && <Badge variant="outline" className="ml-1">ปิดใช้งาน</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={()=>openEdit(p)}><Edit2 className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={()=>del(p.id)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
              </div>
            </div>
            {p.description && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">{p.description}</p>}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id?"แก้ไขแพ็คเกจ":"เพิ่มแพ็คเกจ"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
            <div className="space-y-1.5"><Label>รายละเอียด</Label><Textarea rows={4} value={edit.description||""} onChange={e=>setEdit({...edit,description:e.target.value})}/></div>
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
                return (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_56px_auto] gap-2 items-center">
                      <Input placeholder="เช่น Standard, ยอดนิยม" value={t.tier_name||""} onChange={e=>{const n=[...edit.pricing_tiers];n[i]={...n[i],tier_name:e.target.value};setEdit({...edit,pricing_tiers:n});}}/>
                      <Input type="number" placeholder="40" value={t.total_pax||""} onChange={e=>{const n=[...edit.pricing_tiers];n[i]={...n[i],total_pax:e.target.value};setEdit({...edit,pricing_tiers:n});}}/>
                      <Input type="number" placeholder="9" value={t.monk_pax||""} onChange={e=>{const n=[...edit.pricing_tiers];n[i]={...n[i],monk_pax:e.target.value};setEdit({...edit,pricing_tiers:n});}}/>
                      <Input type="number" placeholder="30000" value={t.price||""} onChange={e=>{const n=[...edit.pricing_tiers];n[i]={...n[i],price:e.target.value};setEdit({...edit,pricing_tiers:n});}}/>
                      <TierImageField url={t.image_url} onChange={(v)=>{const n=[...edit.pricing_tiers];n[i]={...n[i],image_url:v};setEdit({...edit,pricing_tiers:n});}}/>
                      <Button size="icon" variant="ghost" onClick={()=>setEdit({...edit,pricing_tiers:edit.pricing_tiers.filter((_,j)=>j!==i)})}><X className="w-4 h-4"/></Button>
                    </div>
                    {total > 0 && monk > 0 && (
                      <p className="text-xs text-muted-foreground px-1">→ พระ {monk} + แขก {guest} = {total} ท่าน</p>
                    )}
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

            <div className="space-y-1.5"><Label>คำสั่งสำหรับ AI (AI Instruction)</Label><Textarea rows={3} value={edit.ai_instruction||""} onChange={e=>setEdit({...edit,ai_instruction:e.target.value})} placeholder="เช่น: ถ้าลูกค้าถามเรื่องโต๊ะจีน ให้แนะนำเกรด A ก่อน"/></div>
            <div className="space-y-1.5"><Label>หมายเหตุ</Label><Textarea rows={2} value={edit.notes||""} onChange={e=>setEdit({...edit,notes:e.target.value})}/></div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4"/>รูปภาพ (URL)</Label><ImageUrlsField urls={edit.image_urls} onChange={u=>setEdit({...edit,image_urls:u})}/></div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Film className="w-4 h-4"/>วิดีโอ</Label><VideoUrlsField videos={edit.video_urls} onChange={v=>setEdit({...edit,video_urls:v})}/></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <Label>เปิดใช้งาน</Label>
              <Switch checked={edit.is_active} onCheckedChange={v=>setEdit({...edit,is_active:v})}/>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>ยกเลิก</Button><Button onClick={save} disabled={!edit.name}>บันทึก</Button></DialogFooter>
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
  const [edit, setEdit] = useState<Promo>(blankPromo);
  const { data: promos } = useQuery({ queryKey:["promos"], queryFn: async()=>(await supabase.from("promotions").select("*").order("created_at",{ascending:false})).data ?? [] });
  const { data: cats } = useQuery({ queryKey:["pkg-cats"], queryFn: async()=>(await supabase.from("package_categories").select("*").order("sort_order")).data ?? [] });
  const save = async () => {
    const payload:any = {...edit}; delete payload.created_at; delete payload.updated_at;
    const res = edit.id ? await supabase.from("promotions").update(payload).eq("id",edit.id) : await supabase.from("promotions").insert(payload);
    if(res.error) return toast.error(res.error.message);
    toast.success("บันทึกแล้ว"); setOpen(false); qc.invalidateQueries({queryKey:["promos"]});
  };
  const del = async (id:string) => { if(!confirm("ลบ?")) return; await supabase.from("promotions").delete().eq("id",id); qc.invalidateQueries({queryKey:["promos"]}); };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={()=>{setEdit(blankPromo);setOpen(true);}}><Plus/>เพิ่มโปรโมชั่น</Button></div>
      <div className="grid md:grid-cols-2 gap-4">
        {promos?.map((p:any)=>(
          <Card key={p.id} className="p-5 shadow-soft border-border/60">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-display font-semibold">{p.name}</h3>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.applicable_categories?.map((c:string)=>(<Badge key={c} variant="secondary">{c}</Badge>))}
                  {p.min_guests != null && <Badge variant="outline">ขั้นต่ำ {p.min_guests} ท่าน</Badge>}
                </div>
                {p.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{p.description}</p>}
              </div>
              <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>{setEdit({...p,applicable_categories:p.applicable_categories||[],image_urls:p.image_urls||[],video_urls:p.video_urls||[]});setOpen(true);}}><Edit2 className="w-4 h-4"/></Button><Button size="icon" variant="ghost" onClick={()=>del(p.id)}><Trash2 className="w-4 h-4 text-destructive"/></Button></div>
            </div>
          </Card>
        ))}
        {!promos?.length && <Card className="p-10 text-center md:col-span-2"><Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-2"/><p className="text-sm text-muted-foreground">ยังไม่มีโปรโมชั่น</p></Card>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id?"แก้ไขโปรโมชั่น":"เพิ่มโปรโมชั่น"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>ชื่อ *</Label><Input value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div>
            <div className="space-y-1.5"><Label>รายละเอียด</Label><Textarea rows={3} value={edit.description||""} onChange={e=>setEdit({...edit,description:e.target.value})}/></div>
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
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>ยกเลิก</Button><Button onClick={save} disabled={!edit.name}>บันทึก</Button></DialogFooter>
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
  const { data: items, isLoading } = useQuery({
    queryKey: ["kb"],
    queryFn: async () => (await supabase.from("knowledge_base").select("*").order("sort_order")).data ?? [],
  });
  const { data: cats } = useQuery({
    queryKey: ["kb-cats"],
    queryFn: async () => (await supabase.from("knowledge_categories").select("*").order("sort_order").order("name")).data ?? [],
  });

  const openNew = () => { setEdit(blankKB); setOpen(true); };
  const openEdit = (i: any) => { setEdit({ ...i, image_urls: i.image_urls || [], video_urls: i.video_urls || [] }); setOpen(true); };
  const save = async () => {
    const payload: any = { ...edit };
    delete payload.created_at; delete payload.updated_at; delete payload.tags;
    const res = edit.id
      ? await supabase.from("knowledge_base").update(payload).eq("id", edit.id)
      : await supabase.from("knowledge_base").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("บันทึกแล้ว"); setOpen(false); qc.invalidateQueries({ queryKey: ["kb"] });
  };
  const del = async (id: string) => {
    if (!confirm("ลบรายการนี้?")) return;
    await supabase.from("knowledge_base").delete().eq("id", id);
    toast.success("ลบแล้ว"); qc.invalidateQueries({ queryKey: ["kb"] });
  };

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
          <Card key={i.id} className="p-5 shadow-soft border-border/60">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold truncate">{i.title}</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {i.category && <Badge variant="secondary">{i.category}</Badge>}
                  {i.status !== "active" && <Badge variant="outline">ปิดใช้งาน</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(i)}><Edit2 className="w-4 h-4"/></Button>
                <Button size="icon" variant="ghost" onClick={() => del(i.id)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
              </div>
            </div>
            {i.content && <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">{i.content}</p>}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
            <div className="space-y-1.5"><Label>เนื้อหา</Label>
              <Textarea rows={6} value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })}
                placeholder="ใส่ข้อมูล/คำถาม/คำตอบที่ AI ต้องรู้"/>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4"/>รูปภาพ</Label>
              <ImageUrlsField urls={edit.image_urls} onChange={u => setEdit({ ...edit, image_urls: u })}/>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Film className="w-4 h-4"/>วิดีโอ</Label>
              <VideoUrlsField videos={edit.video_urls} onChange={v => setEdit({ ...edit, video_urls: v })}/>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <Label>เปิดใช้งาน</Label>
              <Switch checked={edit.status === "active"}
                onCheckedChange={v => setEdit({ ...edit, status: v ? "active" : "inactive" })}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={!edit.title}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
