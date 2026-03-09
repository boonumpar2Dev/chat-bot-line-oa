import { useState, useRef, useEffect } from "react";
import { Send, RefreshCw, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SUGGESTIONS = ["ร้านตั้งอยู่ที่ไหน", "เวลาทำการกี่โมงคะ", "นโยบายการจัดส่งมีอะไรบ้าง"];

function getItemImages(item) {
  const arr = Array.isArray(item.image_urls) ? [...item.image_urls] : [];
  if (item.file_url && !arr.includes(item.file_url)) arr.unshift(item.file_url);
  return arr;
}

export default function KBChatTest() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    const [kbItems, settingsList] = await Promise.all([
      base44.entities.KnowledgeBase.filter({ status: "active" }),
      base44.entities.AppSettings.filter({ key: "ai_config" }),
    ]);
    const cfg = settingsList?.[0] || {};
    const itemsWithImages = kbItems.filter(i => getItemImages(i).length > 0);

    const knowledgeContext = kbItems.map((item) => {
      const imgs = getItemImages(item);
      return `[ชื่อข้อมูล: "${item.title}"]\n${item.content || ""}${imgs.length > 0 ? `\n[มีรูปภาพประกอบ ${imgs.length} รูป]` : ""}`;
    }).join("\n\n");

    const imageListStr = itemsWithImages.length > 0
      ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${itemsWithImages.map(i => `"${i.title}"`).join(", ")}`
      : "";

    const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
      ? cfg.strict_rules.filter(r => r && r.trim()).map((r, i) => `${i + 1}. ${r}`).join("\n")
      : "";
    const strictRulesSection = strictRules
      ? `\n\n⚠️ กฎเข้มงวดที่ต้องปฏิบัติตามเสมอ:\n${strictRules}`
      : "";

    const topicNames = kbItems.map(k => k.title).filter(Boolean);

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `คุณเป็น AI ผู้ช่วยสำหรับธุรกิจจัดงานและจัดเลี้ยง ตอบเป็นภาษาไทย กระชับ เป็นกันเอง

หลักการตอบ:
- ตอบจากข้อมูลใน Knowledge Base เท่านั้น ห้ามแต่งข้อมูลตัวเลข ราคา รายละเอียดที่ไม่มีอยู่
- ถ้าลูกค้าทักทายกว้างๆ เช่น "สอบถามค่ะ" "สวัสดีค่ะ" "สนใจค่ะ" → ให้ต้อนรับอย่างอบอุ่นและแนะนำหัวข้อบริการ/ข้อมูลที่มีอยู่ให้ลูกค้าเลือกถาม
- หัวข้อข้อมูลที่มีอยู่: ${topicNames.length > 0 ? topicNames.join(', ') : 'ยังไม่มีข้อมูล'}
- ถ้าลูกค้าถามเรื่องที่ไม่มีใน Knowledge Base เลย → ตอบสุภาพว่าจะให้เจ้าหน้าที่ติดต่อกลับ
${strictRulesSection}

Knowledge Base:
${knowledgeContext || "ยังไม่มีข้อมูล"}
${imageListStr}

ประวัติการสนทนา:
${updated.map((m) => `${m.role === "user" ? "ลูกค้า" : "AI"}: ${m.content}`).join("\n")}

ถ้าคำตอบเกี่ยวข้องกับข้อมูลที่มีรูปภาพให้ระบุชื่อข้อมูลนั้นใน image_titles ด้วย`,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          image_titles: {
            type: "array",
            items: { type: "string" },
            description: "ชื่อข้อมูล KB ที่มีรูปภาพควรแสดงประกอบ"
          }
        },
        required: ["answer"]
      }
    });

    const relevantImages = itemsWithImages
      .filter(item => (response.image_titles || []).includes(item.title))
      .flatMap(item => getItemImages(item));

    setMessages((prev) => [...prev, {
      role: "assistant",
      content: response.answer || "ไม่สามารถตอบได้",
      images: relevantImages
    }]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">แชททดสอบ</div>
            <div className="text-[10px] text-muted-foreground">ทดสอบ AI จาก Knowledge Base</div>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="p-2 rounded-lg hover:bg-muted transition-colors" title="รีเซ็ต">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <div className="font-semibold text-foreground">แชททดสอบ</div>
              <p className="text-xs text-muted-foreground mt-1">ลองพูดคุยกับ AI โดยสมมติว่าคุณเป็นลูกค้า</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 rounded-full border border-green-300 text-green-600 text-xs hover:bg-green-50 transition-colors flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              <div className={`px-3 py-2 rounded-xl text-sm ${
                msg.role === "user" ? "bg-green-600 text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
              }`}>
                <span className="whitespace-pre-line">{msg.content}</span>
              </div>
              {msg.images?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.images.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="ภาพประกอบ" className="h-32 w-auto rounded-lg border border-input cursor-pointer hover:opacity-90 transition-opacity shadow-sm object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted px-3 py-2 rounded-xl rounded-bl-sm text-sm text-muted-foreground">กำลังพิมพ์...</div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex items-center gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="ลูกค้าของคุณน่าจะถามอะไร" disabled={loading}
            className="flex-1 px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button type="submit" disabled={loading || !input.trim()}
            className="p-2.5 rounded-lg bg-green-600 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}