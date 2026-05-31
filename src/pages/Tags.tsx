import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tag as TagIcon, Plus, Pencil, Trash2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

type Tag = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  ai_tag_instructions: string | null;
  sort_order: number;
};

const PRESET_COLORS = [
  "#94a3b8", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
];

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: tagData }, { data: custData }] = await Promise.all([
      supabase.from("tags").select("*").order("sort_order").order("name"),
      supabase.from("customers").select("tags"),
    ]);
    const c: Record<string, number> = {};
    (custData || []).forEach((row: any) => {
      (row.tags || []).forEach((t: string) => { c[t] = (c[t] || 0) + 1; });
    });
    setTags((tagData as Tag[]) || []);
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("กรุณาใส่ชื่อแท็ก");
      return;
    }
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      color: editing.color || "#94a3b8",
      description: editing.description || null,
      ai_tag_instructions: editing.ai_tag_instructions || null,
      sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from("tags").update(payload).eq("id", editing.id)
      : await supabase.from("tags").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "อัปเดตแท็กแล้ว" : "เพิ่มแท็กแล้ว");
    setEditing(null);
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("tags").delete().eq("id", deleting.id);
    if (error) { toast.error(error.message); return; }
    toast.success("ลบแท็กแล้ว");
    setDeleting(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <TagIcon className="w-6 h-6 text-primary" />
            แท็กลูกค้า
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            จัดการแท็กที่ใช้กับลูกค้า ปรับสี และตั้งคำสั่งให้ AI ปรับสไตล์ตอบตามแท็ก
          </p>
        </div>
        <Button onClick={() => setEditing({ color: "#94a3b8", sort_order: 0 })} className="gap-1">
          <Plus className="w-4 h-4" /> เพิ่มแท็ก
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">กำลังโหลด...</div>
      ) : tags.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            ยังไม่มีแท็ก — กดปุ่ม "เพิ่มแท็ก" เพื่อเริ่ม
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tags.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge
                      style={{ backgroundColor: t.color, color: "#fff" }}
                      className="text-sm px-2.5 py-1 border-0"
                    >
                      {t.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Users className="w-3 h-3" /> {counts[t.name] || 0}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(t)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                {t.ai_tag_instructions && (
                  <div className="flex items-start gap-1.5 text-xs bg-primary/5 text-primary rounded-md p-2">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{t.ai_tag_instructions}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "แก้ไขแท็ก" : "เพิ่มแท็กใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">ชื่อแท็ก *</Label>
              <Input
                value={editing?.name || ""}
                onChange={(e) => setEditing({ ...editing!, name: e.target.value })}
                placeholder="เช่น VIP, ลูกค้าซ้ำ, บริษัท"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">สี</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditing({ ...editing!, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${editing?.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <Input
                  type="color"
                  value={editing?.color || "#94a3b8"}
                  onChange={(e) => setEditing({ ...editing!, color: e.target.value })}
                  className="w-12 h-7 p-0.5 cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">คำอธิบาย (ไม่บังคับ)</Label>
              <Input
                value={editing?.description || ""}
                onChange={(e) => setEditing({ ...editing!, description: e.target.value })}
                placeholder="เช่น ลูกค้าระดับพรีเมียม ยอดซื้อ > 50,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                คำสั่ง AI สำหรับแท็กนี้ (ไม่บังคับ)
              </Label>
              <Textarea
                value={editing?.ai_tag_instructions || ""}
                onChange={(e) => setEditing({ ...editing!, ai_tag_instructions: e.target.value })}
                placeholder="เช่น ลูกค้านี้เป็น VIP ให้ใช้ภาษาทางการขึ้น เสนอแพ็กเกจระดับบนก่อน"
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">
                ระบบจะแทรกคำสั่งนี้ลงใน prompt ของ AI เมื่อตอบลูกค้าที่มีแท็กนี้
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ลำดับการแสดง</Label>
              <Input
                type="number"
                value={editing?.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing!, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
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
            <AlertDialogDescription>
              การลบแท็กออกจาก master list จะไม่ได้ลบแท็กออกจากลูกค้าที่เคยติดอยู่ — แต่จะแสดงเป็นสีเทาแทน
            </AlertDialogDescription>
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
