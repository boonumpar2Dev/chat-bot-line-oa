import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; confidence?: number; image_urls?: string[]; business_data_debug?: any };

const SUGGESTIONS = [
  "สอบถามแพ็กเกจจัดเลี้ยงค่ะ",
  "มีบริการจัดงานบุญไหมคะ",
  "ราคาโต๊ะจีนเท่าไหร่",
];

export default function KBChatTest() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Msg = { role: "user", content: t };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const history = updated.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("kb-chat-test", {
        body: { message: t, history: history.slice(0, -1) },
      });
      if (error) throw error;
      setMessages(p => [...p, {
        role: "assistant",
        content: data.answer || "—",
        confidence: data.confidence,
        image_urls: data.image_urls || [],
        business_data_debug: data.business_data_debug,
      }]);
    } catch (e: any) {
      toast.error("ทดสอบล้มเหลว: " + e.message);
      setMessages(p => [...p, { role: "assistant", content: "❌ " + e.message }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary"/>
          <span className="text-sm font-semibold">ทดสอบ AI</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setMessages([])} disabled={!messages.length}>
          <RefreshCw className="w-3 h-3"/>
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef as any}>
        {messages.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-xs text-muted-foreground">ลองถามคำถามที่ลูกค้าน่าจะถาม</p>
            <div className="flex flex-col gap-1.5 max-w-sm mx-auto">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg border hover:bg-accent transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                {m.role === "assistant" && m.confidence != null && (
                  <span className="text-[10px] text-muted-foreground px-2">AI • {m.confidence}%</span>
                )}
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {m.content}
                </div>
                {m.image_urls && m.image_urls.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-[85%]">
                    {m.image_urls.map(u => <img key={u} src={u} alt="" className="w-20 h-20 rounded-lg object-cover border"/>)}
                  </div>
                )}
                {m.business_data_debug && (
                  <div className="text-[10px] text-muted-foreground px-2 max-w-[85%]">
                    <span className={cn("px-1.5 py-0.5 rounded font-medium",
                      m.business_data_debug.action === "handoff" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    )}>
                      BD: {m.business_data_debug.action} · {m.business_data_debug.reason}
                    </span>
                    <span className="ml-1">
                      cat={m.business_data_debug.category} · ids={m.business_data_debug.validatedSourceIds?.length ?? 0}/{m.business_data_debug.modelSourceIds?.length ?? 0} · retrieved={m.business_data_debug.retrievedSourceCount ?? 0}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin"/> AI กำลังคิด…</div>}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="พิมพ์เหมือนเป็นลูกค้า…" disabled={loading}/>
        <Button onClick={() => send(input)} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
        </Button>
      </div>
    </div>
  );
}
