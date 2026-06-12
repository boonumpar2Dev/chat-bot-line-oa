import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Shield, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { triggerRebuildAiCache } from "@/pages/Knowledge";
import { useAutoSaveDraft, readDraft, clearDraft } from "@/hooks/useDraft";
import DraftBanner, { DraftSavedIndicator } from "@/components/knowledge/DraftBanner";

const DRAFT_KEY = "ai-rules:main";

export default function AiRulesTab() {
  const [rules, setRules] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialJSON, setInitialJSON] = useState<string>("");
  const [foundDraft, setFoundDraft] = useState<{ value: string[]; savedAt: number } | null>(null);
  const isDirty = !!rules && JSON.stringify(rules) !== initialJSON;
  const { savedAt, clear: clearDraftState } = useAutoSaveDraft<string[]>(DRAFT_KEY, rules ?? [], !!rules, { isDirty });

  useEffect(() => {
    supabase.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle()
      .then(({ data }) => {
        const loaded = (data?.strict_rules as string[]) || [];
        setRules(loaded);
        setInitialJSON(JSON.stringify(loaded));
        const d = readDraft<string[]>(DRAFT_KEY);
        if (d && JSON.stringify(d.value) !== JSON.stringify(loaded)) setFoundDraft(d);
        else if (d) clearDraft(DRAFT_KEY);
      });
  }, []);

  const restoreDraft = () => { if (foundDraft) { setRules(foundDraft.value); setFoundDraft(null); toast.success("กู้คืนฉบับร่างแล้ว"); } };
  const discardDraft = () => { clearDraft(DRAFT_KEY); clearDraftState(); setFoundDraft(null); toast("ทิ้งฉบับร่างแล้ว"); };

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    const cleaned = rules.map(r => r.trim()).filter(Boolean);
    const { error } = await supabase.from("app_settings")
      .update({ strict_rules: cleaned })
      .eq("key", "ai_config");
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกกฎแล้ว");
    setInitialJSON(JSON.stringify(rules));
    clearDraft(DRAFT_KEY);
    clearDraftState();
    triggerRebuildAiCache();
  };

  if (!rules) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="space-y-3">
      {foundDraft && <DraftBanner savedAt={foundDraft.savedAt} onRestore={restoreDraft} onDiscard={discardDraft} />}
      <Card className="p-6 shadow-soft border-border/60">
        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <div className="flex items-center gap-2"><Shield className="text-primary"/><h2 className="font-display text-lg font-semibold">กฎ AI (วิธีคุย/ห้าม/ต้อง)</h2></div>
          <div className="flex items-center gap-2">
            <DraftSavedIndicator savedAt={savedAt} />
            <Badge variant="secondary">{rules.length} ข้อ</Badge>
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4"/>} บันทึก
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-4 space-y-1">
          <p>📌 กฎทุกข้อจะถูกส่งให้ AI <b>ทุกครั้ง</b> ที่ตอบลูกค้า — เขียนสั้น/บังคับพฤติกรรม</p>
          <p>💡 ถ้าเป็น <b>ข้อมูล</b> (เมนู/ราคา/รีวิว/FAQ/เงื่อนไขค่าส่ง) → ใส่ในแท็บ <b>ข้อมูลทั่วไป</b> แทน จะหยิบมาเฉพาะเมื่อเกี่ยวข้อง ประหยัด token</p>
        </div>

        <div className="space-y-3">
          {rules.length === 0 && (
            <div className="text-center py-8 rounded-lg border-2 border-dashed">
              <p className="text-sm text-muted-foreground">ยังไม่มีกฎ — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
            </div>
          )}
          {rules.map((r, i) => (
            <div key={i} className="group relative rounded-lg border bg-card hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-2 p-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</div>
                <Textarea
                  value={r}
                  onChange={e => {
                    const next = [...rules];
                    next[i] = e.target.value;
                    setRules(next);
                  }}
                  rows={Math.max(2, Math.ceil(r.length / 70))}
                  className="flex-1 resize-none border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none text-sm leading-relaxed"
                  placeholder="พิมพ์กฎที่นี่…"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setRules(rules.filter((_, j) => j !== i))}
                  title="ลบกฎนี้"
                >
                  <X className="w-4 h-4"/>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full mt-3 border-dashed"
          onClick={() => setRules([...rules, ""])}
        >
          <Plus className="w-4 h-4"/> เพิ่มกฎใหม่
        </Button>
      </Card>
    </div>
  );
}
