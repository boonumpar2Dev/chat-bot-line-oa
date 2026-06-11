import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Sparkles, RefreshCw, Check, X, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; proposed?: any };

interface Props {
  initialAuditId?: string | null;
  onClearAudit?: () => void;
  initialAuditLabel?: string;
}

const SUGGESTIONS = [
  "ทำไม AI ไม่เสนอโต๊ะจีนทั้งที่แขก 298 ท่าน?",
  "AI ตื๊อขอเบอร์ลูกค้าซ้ำๆ ช่วยแก้กฎหน่อย",
  "เพิ่มกฎห้าม AI ตอบราคาถ้ายังไม่รู้จังหวัด",
];

export default function AiCoachChat({ initialAuditId, onClearAudit, initialAuditLabel }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-coach-chat", {
        body: {
          messages: next.map(m => ({ role: m.role, content: m.content })),
          audit_id: initialAuditId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages(p => [...p, { role: "assistant", content: data.reply || "—", proposed: data.proposed }]);
    } catch (e: any) {
      toast.error("Coach error: " + e.message);
      setMessages(p => [...p, { role: "assistant", content: "❌ " + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const applyProposed = async (proposed: any) => {
    if (!proposed) return;
    setApplying(true);
    try {
      const { data: cur } = await supabase.from("app_settings").select("strict_rules").eq("key", "ai_config").maybeSingle();
      let rules: string[] = [...((cur?.strict_rules as string[]) || [])];

      // replace by index first
      if (Array.isArray(proposed.replace_rules)) {
        for (const r of proposed.replace_rules) {
          if (typeof r?.index === "number" && rules[r.index] !== undefined && r.new) rules[r.index] = String(r.new);
        }
      }
      // remove by index (desc)
      if (Array.isArray(proposed.remove_rule_indexes)) {
        const idxs = [...proposed.remove_rule_indexes].filter((i: any) => typeof i === "number").sort((a: number, b: number) => b - a);
        for (const i of idxs) rules.splice(i, 1);
      }
      // add new
      if (Array.isArray(proposed.add_rules)) {
        for (const r of proposed.add_rules) if (typeof r === "string" && r.trim()) rules.push(r.trim());
      }
      rules = rules.map(r => r.trim()).filter(Boolean);

      const { error } = await supabase.from("app_settings").update({ strict_rules: rules }).eq("key", "ai_config");
      if (error) throw error;

      // Trigger cache rebuild (best effort)
      try { await supabase.functions.invoke("rebuild-ai-cache"); } catch { /* ignore */ }

      toast.success(`บันทึกแล้ว — กฎทั้งหมด ${rules.length} ข้อ`);
      setMessages(p => [...p, { role: "assistant", content: `✅ Applied: ${proposed.summary || "อัปเดตกฎเรียบร้อย"} (รวม ${rules.length} ข้อ)` }]);
    } catch (e: any) {
      toast.error("Apply ล้มเหลว: " + e.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="shadow-soft border-border/60 flex flex-col h-[calc(100vh-22rem)] min-h-[500px] overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">AI Coach</p>
            <p className="text-xs text-muted-foreground truncate">
              คุยเพื่อแก้กฎ/วิเคราะห์เคส — ไม่ต้องเข้า Lovable
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {initialAuditId && (
            <Badge variant="secondary" className="h-6 gap-1 max-w-[180px]">
              <span className="truncate">📎 {initialAuditLabel || "เคสที่แนบ"}</span>
              <button onClick={onClearAudit} className="hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => setMessages([])} disabled={!messages.length}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
        {messages.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">ลองถาม Coach</p>
            <div className="flex flex-col gap-1.5 max-w-md mx-auto">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg border hover:bg-accent transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {m.content.replace(/```json[\s\S]*?```/g, "").trim() || m.content}
                </div>
                {m.proposed && (
                  <ProposedCard proposed={m.proposed} applying={applying} onApply={() => applyProposed(m.proposed)} />
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Coach กำลังวิเคราะห์…
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={initialAuditId ? "ถาม Coach เกี่ยวกับเคสนี้…" : "พิมพ์คำถามหรือสิ่งที่อยากแก้…"}
          disabled={loading}
        />
        <Button onClick={() => send(input)} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
}

function ProposedCard({ proposed, applying, onApply }: { proposed: any; applying: boolean; onApply: () => void }) {
  return (
    <div className="max-w-[88%] w-full rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" /> เสนอแก้กฎ
        </p>
        <Button size="sm" onClick={onApply} disabled={applying} className="h-7">
          {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Apply
        </Button>
      </div>
      {proposed.summary && <p className="text-xs text-foreground/80">{proposed.summary}</p>}
      {Array.isArray(proposed.add_rules) && proposed.add_rules.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-success uppercase mb-1">+ เพิ่ม ({proposed.add_rules.length})</p>
          <ul className="space-y-1">
            {proposed.add_rules.map((r: string, i: number) => (
              <li key={i} className="text-xs bg-success/10 border border-success/20 rounded px-2 py-1 break-words">{r}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(proposed.replace_rules) && proposed.replace_rules.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-warning uppercase mb-1">↻ แก้ ({proposed.replace_rules.length})</p>
          <ul className="space-y-1">
            {proposed.replace_rules.map((r: any, i: number) => (
              <li key={i} className="text-xs bg-warning/10 border border-warning/20 rounded px-2 py-1 break-words">
                <span className="text-muted-foreground">#{r.index} →</span> {r.new}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(proposed.remove_rule_indexes) && proposed.remove_rule_indexes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-destructive uppercase mb-1">− ลบ index: {proposed.remove_rule_indexes.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
