import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, BookPlus, Globe, User, Sparkles, AlertTriangle, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TeachCtx = {
  customerId: string;
  customerName?: string;
  question: string; // ลูกค้าถามอะไร (ข้อความก่อนหน้า)
  answer: string;   // แอดมินตอบอะไร (ข้อความที่กด)
};

export function TeachToKbDialog({ ctx, onClose }: { ctx: TeachCtx | null; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<"kb" | "note">("kb");
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [isGeneral, setIsGeneral] = useState(true);
  const [similar, setSimilar] = useState<{ id: string; title: string; score: number }[]>([]);

  useEffect(() => {
    if (!ctx) return;
    setQ(ctx.question || "");
    setA(ctx.answer || "");
    setTitle("");
    setTarget("kb");
    setCategory("");
    setRefined(false);
    setDiagnosis("");
    setIsGeneral(true);
    setSimilar([]);
    supabase.from("knowledge_categories").select("id,name").order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
  }, [ctx]);

  if (!ctx) return null;

  const refine = async () => {
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke("refine-kb-draft", {
        body: { customer_id: ctx.customerId, raw_q: q, raw_a: a },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d: any = data;
      if (d.title) setTitle(d.title);
      if (d.q) setQ(d.q);
      if (d.a) setA(d.a);
      if (d.category) setCategory(d.category);
      setDiagnosis(d.diagnosis || "");
      setIsGeneral(d.is_general !== false);
      setSimilar(Array.isArray(d.similar) ? d.similar : []);
      setRefined(true);
      toast.success("✨ AI เรียบเรียงให้แล้ว — ตรวจสอบก่อนบันทึก");
    } catch (e: any) {
      toast.error(e.message || "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setRefining(false);
    }
  };

  const save = async () => {
    if (!a.trim()) { toast.error("คำตอบว่าง"); return; }
    setSaving(true);
    try {
      if (target === "kb") {
        const finalTitle = (title.trim() || q.trim() || a.trim()).slice(0, 60);
        const content = q.trim() ? `Q: ${q.trim()}\nA: ${a.trim()}` : a.trim();
        const { data: row, error } = await supabase.from("knowledge_base").insert({
          title: finalTitle,
          content,
          category: category || null,
          status: "active",
        }).select("id").single();
        if (error) throw error;
        // trigger embed (fire-and-forget)
        if (row?.id) supabase.functions.invoke("embed-content", { body: { table: "knowledge_base", id: row.id } }).catch(()=>{});
        supabase.functions.invoke("rebuild-ai-cache").catch(()=>{});
        toast.success("✅ เพิ่มเข้า KB กลางแล้ว");
      } else {
        // append to customers.customer_notes
        const { data: cust, error: e1 } = await supabase
          .from("customers").select("customer_notes").eq("id", ctx.customerId).maybeSingle();
        if (e1) throw e1;
        const existing: any[] = Array.isArray((cust as any)?.customer_notes) ? (cust as any).customer_notes : [];
        const next = [...existing, {
          q: q.trim() || null,
          a: a.trim(),
          created_at: new Date().toISOString(),
        }];
        const { error: e2 } = await supabase.from("customers")
          .update({ customer_notes: next }).eq("id", ctx.customerId);
        if (e2) throw e2;
        toast.success("✅ บันทึกเป็นโน้ตของลูกค้าคนนี้แล้ว");
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ctx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookPlus className="w-4 h-4 text-primary" />
            เพิ่มเป็นความรู้ AI
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            บันทึกคำถาม/คำตอบนี้ให้ AI ใช้ตอบครั้งหน้า
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">คำถาม (จากลูกค้า)</Label>
            <Textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ลูกค้าถามว่าอะไร" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">คำตอบ (ที่อยากให้ AI ใช้)</Label>
            <Textarea rows={3} value={a} onChange={(e) => setA(e.target.value)}
              placeholder="คำตอบที่ถูกต้อง" />
          </div>

          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-medium">เก็บที่ไหน?</Label>
            <RadioGroup value={target} onValueChange={(v) => setTarget(v as any)} className="space-y-2">
              <label className="flex items-start gap-2.5 p-2 rounded-md border bg-card cursor-pointer hover:bg-accent/50">
                <RadioGroupItem value="kb" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Globe className="w-3.5 h-3.5 text-blue-600" />KB กลาง
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ลูกค้าทุกคนใช้ได้ — เลือกเมื่อเป็นเรื่องทั่วไป (ราคา, โปร, นโยบาย)
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-2 rounded-md border bg-card cursor-pointer hover:bg-accent/50">
                <RadioGroupItem value="note" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="w-3.5 h-3.5 text-amber-600" />
                    โน้ตเฉพาะ {ctx.customerName ? `"${ctx.customerName}"` : "ลูกค้าคนนี้"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ใช้เฉพาะตอนคุยกับลูกค้าคนนี้ — เลือกเมื่อเป็นเรื่องเฉพาะตัว (แพ้อาหาร, ที่อยู่พิเศษ)
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {target === "kb" && (
            <div className="space-y-1.5">
              <Label className="text-xs">หมวดหมู่ (ไม่บังคับ)</Label>
              <Select value={category || "__none"} onValueChange={(v) => setCategory(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="ไม่ระบุ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">ไม่ระบุ</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
