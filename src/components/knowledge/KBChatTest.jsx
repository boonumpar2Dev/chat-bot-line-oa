import { useState, useRef, useEffect } from "react";
import { Send, RefreshCw, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SUGGESTIONS = ["สอบถามแพ็กเกจจัดเลี้ยงค่ะ", "มีบริการจัดงานบุญไหมคะ", "ราคาโต๊ะจีนเท่าไหร่"];

function getItemImages(item) {
  const arr = Array.isArray(item.image_urls) ? [...item.image_urls] : [];
  if (item.file_url && !arr.includes(item.file_url)) arr.unshift(item.file_url);
  return arr;
}

export default function KBChatTest() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSentTitles, setLastSentTitles] = useState([]);
  const cachedData = useRef(null);
  const [dataReady, setDataReady] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Pre-load all data once on mount
  useEffect(() => {
    Promise.all([
      base44.entities.KnowledgeBase.filter({ status: "active" }),
      base44.entities.AppSettings.filter({ key: "ai_config" }),
      base44.entities.CateringPackage.filter({ is_active: true }),
      base44.entities.Promotion.filter({ is_active: true }),
    ]).then(([kb, settings, pkgs, promos]) => {
      cachedData.current = { kb: kb || [], settings: settings?.[0] || {}, pkgs: pkgs || [], promos: promos || [] };
      setDataReady(true);
    });
  }, []);

  const sendMessage = async (text) => {
    if (!text.trim() || loading || !cachedData.current) return;
    const userMsg = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    const { kb: kbItems, settings: cfg, pkgs, promos } = cachedData.current;
    const itemsWithImages = kbItems.filter(i => getItemImages(i).length > 0);
    const pkgsWithImages = (pkgs || []).filter(p => p.image_urls?.length > 0);

    const knowledgeContext = kbItems.map((item) => {
      const imgs = getItemImages(item);
      return `[ชื่อข้อมูล: "${item.title}"]\n${item.content || ""}${imgs.length > 0 ? `\n[มีรูปภาพประกอบ ${imgs.length} รูป]` : ""}`;
    }).join("\n\n");

    // Build package context
    const pkgContext = (pkgs || []).length > 0 ? '\n\n--- แคตตาล็อกแพ็กเกจ ---\n' + pkgs.map(p => {
      let s = `[แพ็กเกจ: "${p.name}"]`;
      if (p.category) s += `\nประเภท: ${p.category}`;
      if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
      if (p.pricing_tiers?.length > 0) {
        s += '\nราคา:';
        p.pricing_tiers.forEach(t => {
          const total = t.total_pax || 0;
          const monk = t.monk_pax || 0;
          const guest = t.guest_pax || (total - monk);
          const tierLabel = t.tier_name ? `[${t.tier_name}] ` : '';
          if (total > 0 && monk > 0) {
            s += `\n  - ${tierLabel}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${t.price}`;
          } else if (t.guest_count) {
            s += `\n  - ${tierLabel}${t.guest_count}: ${t.price}`;
          } else {
            s += `\n  - ${tierLabel}${total || '?'} ท่าน: ${t.price}`;
          }
        });
      }
      if (Array.isArray(p.custom_attributes) && p.custom_attributes.length > 0) {
        s += '\nข้อมูลเพิ่มเติม:';
        p.custom_attributes.forEach(attr => {
          if (attr.label && attr.value) s += `\n  - ${attr.label}: ${attr.value}`;
        });
      }
      if (p.description) s += `\nรายละเอียดอาหาร:\n${p.description}`;
      if (p.notes) s += `\nหมายเหตุ: ${p.notes}`;
      if (p.ai_instruction) s += `\n🤖 คำสั่ง AI สำหรับแพ็กเกจนี้: ${p.ai_instruction}`;
      if (p.image_urls?.length > 0) s += `\n[มีรูปภาพโบรชัวร์ ${p.image_urls.length} รูป]`;
      return s;
    }).join('\n\n') : '';

    const promosWithImages = (promos || []).filter(pr => pr.image_urls?.length > 0);
    const promoContext = (promos || []).length > 0 ? '\n\n--- โปรโมชั่นปัจจุบัน ---\n' + promos.map(pr => {
      let s = `[โปรโมชั่น: "${pr.name}"]`;
      if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(', ')}`;
      if (pr.description) s += `\n${pr.description}`;
      if (pr.image_urls?.length > 0) s += `\n[มีรูปโปรโมชั่น ${pr.image_urls.length} รูป]`;
      return s;
    }).join('\n\n') : '';

    const allImageSources = [
      ...itemsWithImages.map(i => `"${i.title}"`),
      ...pkgsWithImages.map(p => `"แพ็กเกจ: ${p.name}"`),
      ...promosWithImages.map(pr => `"โปรโมชั่น: ${pr.name}"`),
    ];
    const imageListStr = allImageSources.length > 0
      ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${allImageSources.join(", ")}`
      : "";

    const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
      ? cfg.strict_rules.filter(r => r && r.trim()).map((r, i) => `${i + 1}. ${r}`).join("\n")
      : "";
    const strictRulesSection = strictRules
      ? `\n\n⚠️ กฎเข้มงวดที่ต้องปฏิบัติตามเสมอ:\n${strictRules}`
      : "";

    const topicNames = [
      ...kbItems.map(k => k.title).filter(Boolean),
      ...(pkgs || []).map(p => `แพ็กเกจ: ${p.name}`).filter(Boolean),
    ];

    const confidenceThreshold = cfg.confidence_threshold || 75;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `คุณเป็น AI ผู้ช่วยสำหรับธุรกิจจัดงานและจัดเลี้ยง ตอบเป็นภาษาไทย กระชับ เป็นกันเอง

หลักการตอบ:
- ตอบจากข้อมูลใน Knowledge Base เท่านั้น ห้ามแต่งข้อมูลตัวเลข ราคา รายละเอียดที่ไม่มีอยู่
- ถ้าลูกค้าทักทายกว้างๆ เช่น "สอบถามค่ะ" "สวัสดีค่ะ" "สนใจค่ะ" → ให้ต้อนรับอย่างอบอุ่น แล้วถามเก็บข้อมูลเลย เช่น งานจัดเลี้ยงประเภทไหน จำนวนคนประมาณเท่าไหร่ วันที่จัดงาน ฯลฯ เพื่อจะได้แนะนำแพ็กเกจที่เหมาะสม
- ห้ามแสดงรายการหัวข้อให้ลูกค้าเลือก ห้ามบอกว่า "มีหัวข้อดังนี้..." หรือ "สามารถเลือกสอบถามได้ดังนี้..." เพราะดูเหมือนเมนูหุ่นยนต์ ให้สนทนาเป็นธรรมชาติแทน
- ถ้าลูกค้าถามเรื่องที่ไม่มีใน Knowledge Base เลย → ตอบสุภาพว่าจะให้เจ้าหน้าที่ติดต่อกลับ
- จัดรูปแบบข้อความให้อ่านง่าย ใช้การขึ้นบรรทัดใหม่จริงๆ (newline character) แยกหัวข้อ/ประเด็นให้ชัดเจน
- ห้ามใส่ \\n เป็นตัวอักษร ต้องขึ้นบรรทัดใหม่จริงๆ
- ห้ามใช้ emoji แทนการขึ้นบรรทัดใหม่ ห้ามเขียนติดกันเป็นพรืดยาว
- แต่ละประเด็น/หัวข้อ ต้องแยกย่อหน้าชัดเจน เว้นบรรทัดว่างระหว่างกัน
- ใช้ตัวเลขหรือขีดกลาง (-) นำหน้าแต่ละหัวข้อย่อย แล้วขึ้นบรรทัดใหม่

🔴 กฎเหล็กเรื่องจำนวนคน (พระสงฆ์ + แขก) — ห้ามละเลย:
1. กฎการคำนวณ: เมื่อลูกค้าแจ้งจำนวนคน ต้องวิเคราะห์ก่อนว่าตัวเลขนั้น "รวมพระหรือยัง?" ถ้าลูกค้าพูดแค่ "40 คน" ต้องถามกลับว่ารวมพระสงฆ์หรือเปล่า ก่อนเสนอแพ็กเกจ
2. กฎการนำเสนอ: ทุกครั้งที่เสนอแพ็กเกจ บังคับอธิบายสัดส่วนเสมอ เช่น "แพ็กเกจ 40 ท่าน (รวมพระสงฆ์ 9 รูป + แขก 31 ท่าน)"
3. กฎป้องกันความผิดพลาด (Safety Check): หากลูกค้าบอก "มีแขก 40 ท่าน" (เฉพาะแขก ไม่รวมพระ) → ต้องเสนอแพ็กเกจที่ใหญ่กว่า เช่น 50 ท่าน (พระ 9 + แขก 41) เพื่อให้อาหารเพียงพอ พร้อมอธิบายเหตุผลสุภาพ
4. ห้ามเสนอแพ็กเกจที่มีจำนวนแขก (guest_pax) น้อยกว่าที่ลูกค้าต้องการ เด็ดขาด
${strictRulesSection}

Knowledge Base:
${knowledgeContext || "ยังไม่มีข้อมูล"}
${pkgContext}
${promoContext}
${imageListStr}

ประวัติการสนทนา:
${updated.map((m) => `${m.role === "user" ? "ลูกค้า" : "AI"}: ${m.content}`).join("\n")}

ตอบเป็น JSON โดย:
- answer: คำตอบ (ใช้การขึ้นบรรทัดใหม่จริงๆ เพื่อจัดรูปแบบ)
- confidence: คะแนนความมั่นใจ 0-100 ว่าคำตอบถูกต้องตาม KB
- image_titles: ชื่อข้อมูล KB หรือ "แพ็กเกจ: ..." ที่มีรูปภาพควรแสดงประกอบ`,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          confidence: { type: "number", description: "ความมั่นใจ 0-100" },
          image_titles: {
            type: "array",
            items: { type: "string" },
            description: "ชื่อข้อมูล KB ที่มีรูปภาพควรแสดงประกอบ"
          }
        },
        required: ["answer", "confidence"]
      }
    });

    const confidence = typeof response.confidence === 'number' ? response.confidence : 85;

    const currentTitles = response.image_titles || [];
    const sortedCurrent = [...currentTitles].sort().join('|');
    const sortedLast = [...lastSentTitles].sort().join('|');
    const isSameTitles = sortedCurrent === sortedLast && sortedCurrent.length > 0;

    const kbImages = itemsWithImages.filter(item => currentTitles.includes(item.title)).flatMap(item => getItemImages(item));
    const pkgImages = pkgsWithImages.filter(p => currentTitles.includes(`แพ็กเกจ: ${p.name}`)).flatMap(p => p.image_urls || []);
    const promoImages = promosWithImages.filter(pr => currentTitles.includes(`โปรโมชั่น: ${pr.name}`)).flatMap(pr => pr.image_urls || []);
    const imagesToShow = isSameTitles ? [] : [...kbImages, ...pkgImages, ...promoImages];

    if (currentTitles.length > 0) {
      setLastSentTitles(currentTitles);
    }

    const cleanAnswer = String(response.answer || "ไม่สามารถตอบได้")
      .replace(/\\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    setMessages((prev) => [...prev, {
      role: "assistant",
      content: cleanAnswer,
      images: imagesToShow,
      confidence,
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
        <button onClick={() => { setMessages([]); setLastSentTitles([]); }} className="p-2 rounded-lg hover:bg-muted transition-colors" title="รีเซ็ต">
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
                msg.role === "user" ? "bg-green-600 text-white rounded-br-sm" 
                  : msg.isFallback ? "bg-amber-50 text-amber-800 border border-amber-200 rounded-bl-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}>
                <span className="whitespace-pre-line">{msg.content}</span>
                {msg.confidence && !msg.isFallback && (
                  <div className="mt-1 text-[10px] opacity-60">Confidence: {msg.confidence}%</div>
                )}
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