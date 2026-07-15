import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, BookOpen, Shield, ArrowLeftRight, Check, X, AlertTriangle, RefreshCw, PlusCircle } from "lucide-react";
import { toast } from "sonner";

type ClassifiedItem = {
  action?: "create" | "update";
  type: "rule" | "knowledge";
  content: string;
  title?: string;
  category?: string;
  target_id?: string | null;
  target_rule_index?: number | null;
  original_snippet?: string;
  reasoning?: string;
  similar?: { type: string; snippet: string }[];
};

export default function SmartTeachBox({ categories }: { categories: string[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const classify = async () => {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    setItems([]);
    try {
      const { data, error } = await supabase.functions.invoke("classify-knowledge", { body: { text: t } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const arr: ClassifiedItem[] = Array.isArray(data?.items) ? data.items : [];
      if (!arr.length) throw new Error("AI ไม่สามารถจัดให้ได้ ลองพิมพ์ใหม่อีกครั้งนะคะ");
      setItems(arr);
    } catch (e: any) {
      toast.error(e.message || "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<ClassifiedItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const toggleType = (idx: number) => {
    const it = items[idx];
    updateItem(idx, {
      type: it.type === "rule" ? "knowledge" : "rule",
      title: it.type === "rule" ? (it.title || it.content.slice(0, 30)) : undefined,
      category: it.type === "rule" ? (it.category || categories[0] || "") : undefined,
    });
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveItem = async (idx: number) => {
    const it = items[idx];
    if (!it.content?.trim()) { toast.error("เนื้อหาว่าง"); return; }
    setSavingIdx(idx);
    try {
      const isUpdate = it.action === "update";
      if (it.type === "rule") {
        const { data: cfg } = await supabase.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle();
        const existing: string[] = cfg?.strict_rules || [];
        let next: string[];
        if (isUpdate && typeof it.target_rule_index === "number" && it.target_rule_index >= 0 && it.target_rule_index < existing.length) {
          next = existing.map((r, i) => i === it.target_rule_index ? it.content.trim() : r);
        } else {
          next = [...existing, it.content.trim()];
        }
        const { error } = await supabase.from("app_settings")
          .update({ strict_rules: next })
          .eq("key", "ai_config");
        if (error) throw error;
        toast.success(isUpdate ? "♻️ อัปเดตกฎเดิมแล้ว" : "✅ บันทึกเป็นกฎ AI แล้ว");
      } else {
        if (!it.title?.trim()) { toast.error("ใส่หัวข้อก่อน"); setSavingIdx(null); return; }
        const cat = it.category?.trim() || null;
        if (cat && !categories.includes(cat)) {
          await supabase.from("knowledge_categories").insert({ name: cat });
          qc.invalidateQueries({ queryKey: ["kb-cats"] });
        }
        let savedId: string | undefined;
        if (isUpdate && it.target_id) {
          const { data: upd, error } = await supabase.from("knowledge_base")
            .update({ title: it.title.trim(), content: it.content.trim(), category: cat })
            .eq("id", it.target_id).select("id").maybeSingle();
          if (error) throw error;
          savedId = upd?.id;
          toast.success("♻️ อัปเดตข้อมูลเดิมแล้ว");
        } else {
          const { data: ins, error } = await supabase.from("knowledge_base").insert({
            title: it.title.trim(),
            content: it.content.trim(),
            category: cat,
            status: "active",
          }).select("id").maybeSingle();
          if (error) throw error;
          savedId = ins?.id;
          toast.success("✅ บันทึกเข้าฐานความรู้แล้ว");
        }
        qc.invalidateQueries({ queryKey: ["kb"] });
        supabase.functions.invoke("rebuild-ai-cache").catch(() => {});
        if (savedId) {
          const { triggerEmbed } = await import("@/lib/embed");
          triggerEmbed("knowledge_base", savedId);
        }
      }
      removeItem(idx);
      if (items.length === 1) setText("");
    } catch (e: any) {
      toast.error(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <Card className="p-5 shadow-soft border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="text-primary w-5 h-5" />
        <h2 className="font-display text-lg font-semibold">สอน AI แบบเร็ว ✨</h2>
        <Badge variant="secondary" className="text-[10px]">AI จัดให้ ไม่ต้องคิด</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        พิมพ์อะไรก็ได้ภาษาธรรมดา — AI จะวิเคราะห์ว่าเป็น <b>กฎ</b> (ใช้ทุกครั้ง) หรือ <b>ข้อมูล</b> (ดึงเมื่อลูกค้าถาม) แล้วบันทึกให้
      </p>

      <Textarea
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`เช่น\n• ค่าส่งกรุงเทพฟรี ต่างจังหวัด 15 บ./กม.\n• อย่าชวนลูกค้านอกพื้นที่มาชิมที่ออฟฟิศ\n• เมนูบุฟเฟ่ต์มีไก่ทอด ผัดไทย ส้มตำ`}
        className="bg-background"
        disabled={loading}
      />
      <div className="flex justify-end mt-2">
        <Button onClick={classify} disabled={loading || !text.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "AI กำลังวิเคราะห์…" : "ให้ AI ช่วยจัด"}
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">AI แตกเป็น {items.length} รายการ — ตรวจ/แก้ก่อนกดบันทึก</p>
          {items.map((it, idx) => (
            <Card key={idx} className="p-4 border-l-4" style={{ borderLeftColor: it.type === "rule" ? "hsl(0 80% 55%)" : "hsl(200 80% 50%)" }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {it.type === "rule"
                    ? <Badge className="bg-red-500/10 text-red-700 hover:bg-red-500/10 border-0"><Shield className="w-3 h-3 mr-1" />กฎ AI (ใช้ทุกครั้ง)</Badge>
                    : <Badge className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 border-0"><BookOpen className="w-3 h-3 mr-1" />ฐานความรู้ (ดึงเมื่อถาม)</Badge>
                  }
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleType(idx)} title="AI จัดผิด → ย้ายอีกฝั่ง">
                  <ArrowLeftRight className="w-3 h-3" /> ย้าย
                </Button>
              </div>

              {it.action === "update" && (it.target_id || typeof it.target_rule_index === "number") && (
                <div className="mb-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                      <RefreshCw className="w-3.5 h-3.5" /> อัปเดตของเดิม (ไม่เพิ่มซ้ำ)
                    </span>
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                      onClick={() => updateItem(idx, { action: "create", target_id: null, target_rule_index: null })}
                      title="สร้างใหม่แทน"
                    >
                      <PlusCircle className="w-3 h-3" /> เพิ่มใหม่แทน
                    </Button>
                  </div>
                  {it.original_snippet && (
                    <p className="text-muted-foreground line-clamp-2">ของเดิม: {it.original_snippet}</p>
                  )}
                </div>
              )}

              {it.reasoning && (
                <p className="text-xs text-muted-foreground italic mb-2">💡 {it.reasoning}</p>
              )}

              {it.type === "knowledge" && (
                <div className="grid sm:grid-cols-2 gap-2 mb-2">
                  <div className="space-y-1">
                    <Label className="text-xs">หัวข้อ</Label>
                    <Input value={it.title || ""} onChange={e => updateItem(idx, { title: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">หมวด</Label>
                    <Select value={it.category || ""} onValueChange={v => updateItem(idx, { category: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— เลือก —" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        {it.category && !categories.includes(it.category) && (
                          <SelectItem value={it.category}>+ สร้างใหม่: {it.category}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">{it.type === "rule" ? "เนื้อหากฎ" : "เนื้อหา"}</Label>
                <Textarea
                  rows={Math.max(2, Math.ceil((it.content?.length || 0) / 80))}
                  value={it.content}
                  onChange={e => updateItem(idx, { content: e.target.value })}
                  className="text-sm bg-background"
                />
              </div>

              {it.similar && it.similar.length > 0 && (
                <div className="mt-2 p-2 rounded bg-amber-500/10 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-700">พบของเดิมที่คล้ายกัน:</p>
                    {it.similar.slice(0, 2).map((s, si) => (
                      <p key={si} className="text-muted-foreground line-clamp-1">• {s.snippet}</p>
                    ))}
                    <p className="text-amber-700 mt-0.5">ตรวจให้แน่ใจว่าไม่ซ้ำก่อนบันทึก</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-3">
                <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>
                  <X className="w-3.5 h-3.5" /> ทิ้ง
                </Button>
                <Button size="sm" onClick={() => saveItem(idx)} disabled={savingIdx === idx}>
                  {savingIdx === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : it.action === "update" ? <RefreshCw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  {it.action === "update" ? "อัปเดตของเดิม" : "บันทึกใหม่"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
