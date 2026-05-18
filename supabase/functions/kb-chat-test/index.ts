// kb-chat-test: stateless AI chat for testing knowledge base / packages / promotions
// Uses Lovable AI Gateway (no API key needed). Mirrors the prompt logic of line-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function getItemImages(item: any) {
  return Array.isArray(item.image_urls) ? item.image_urls : [];
}
function getItemVideos(item: any): { url: string; thumb_url: string }[] {
  return Array.isArray(item.video_urls) ? item.video_urls.filter((v: any) => v?.url && v?.thumb_url) : [];
}

async function callAI(prompt: string, model: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  // Strip markdown code fence if present
  const cleaned = txt.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    // Try to extract first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    console.warn("AI response not JSON-parseable:", txt.slice(0, 200));
    return { answer: cleaned, confidence: 80, image_titles: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const bypassHeader = req.headers.get("x-test-bypass") ?? "";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const isBypass = !!lovableKey && bypassHeader === lovableKey;

    if (!authHeader && !isBypass) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );
    if (!isBypass) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const text: string = (body.message || "").trim();
    const history: Array<{ role: string; content: string }> = body.history || [];
    if (!text) return Response.json({ error: "Missing message" }, { status: 400, headers: corsHeaders });

    // เช็ค context จาก history: AI เพิ่งถาม Tag/Tax ID มาหรือเปล่า
    const lastAi = [...history].reverse().find(h => h.role === "assistant")?.content || "";
    const aiAskedTax = /(tag\s*id|เลขผู้เสีย|เลขประจำตัวผู้เสียภาษี|นิติบุคคล|tax\s*id)/i.test(lastAi);

    // Tax ID detection
    const allDigitRuns = (text.match(/\d+/g) || []);
    const taxKeyword = /(tag|แท็ก|tax|ภาษี|เลขผู้เสีย|นิติบุคคล|จดทะเบียน)/i.test(text);
    let taxId: string | null = null;
    let taxIdMaybe: string | null = null;
    for (const d of allDigitRuns) {
      if (d.length === 13) { taxId = d; break; }
      if (taxKeyword && d.length >= 10 && d.length <= 13) { taxId = d; break; }
      // เลข 11-12 หลัก ไม่ใช่เบอร์ไทย → ถือเป็น tax พิมพ์ผิด
      // เลข 9-10 หลัก = tax พิมพ์ผิด เฉพาะกรณี AI เพิ่งถามมา
      if (!taxIdMaybe) {
        if (d.length === 11 || d.length === 12) taxIdMaybe = d;
        else if (aiAskedTax && d.length >= 9 && d.length <= 14) taxIdMaybe = d;
      }
    }
    if (taxId) {
      return Response.json({
        answer: `รับทราบค่ะ ได้รับข้อมูลเลขผู้เสียภาษี/Tag ${taxId} เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏`,
        confidence: 100, image_titles: [],
      }, { headers: corsHeaders });
    }
    if (taxIdMaybe) {
      return Response.json({
        answer: `เลข "${taxIdMaybe}" ดูไม่ครบ 13 หลักนะคะ Tax ID ของบริษัทจะมี 13 หลักพอดีค่ะ รบกวนทวนใหม่อีกครั้งนะคะ 🙏`,
        confidence: 100, image_titles: [],
      }, { headers: corsHeaders });
    }

    // Phone validation — strict Thai format
    // Mobile: 10 digits, starts 06/08/09  | Landline: 9 digits, starts 02-07
    const pureDigits = text.replace(/[\s\-().+]/g, "");
    const isPureNumber = /^\d+$/.test(pureDigits);
    let phone: string | null = null;
    if (isPureNumber && pureDigits.length >= 7 && pureDigits.length <= 12) phone = pureDigits;
    else {
      const seqs = text.match(/\d[\d\s\-().]{6,25}\d/g) || [];
      for (const s of seqs) {
        const d = s.replace(/[^0-9]/g, "");
        if (d.length >= 7 && d.length <= 12) { phone = d; break; }
      }
    }
    if (phone && /^66\d{8,9}$/.test(phone)) phone = "0" + phone.slice(2);
    if (phone) {
      const nonDigit = text.replace(/[0-9\s\-().+]/g, "").trim();
      if (nonDigit.length > 15) phone = null;
    }
    if (phone) {
      const isValidMobile = /^0[689]\d{8}$/.test(phone); // 10 digits, 06/08/09
      const isValidLandline = /^0[2-7]\d{7}$/.test(phone); // 9 digits, 02-07
      if (isValidMobile || isValidLandline) {
        const fmt = isValidMobile
          ? phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
          : phone.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
        return Response.json({
          answer: `ขอบคุณค่ะ บันทึกเบอร์ ${fmt} เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏`,
          confidence: 100, image_titles: [],
        }, { headers: corsHeaders });
      } else if (!/^0/.test(phone) && phone.length >= 9) {
        return Response.json({
          answer: `เบอร์ "${phone}" ไม่ได้ขึ้นต้นด้วย 0 ค่ะ เบอร์ไทยต้องขึ้นต้นด้วย 0 รบกวนทวนใหม่นะคะ`,
          confidence: 100, image_titles: [],
        }, { headers: corsHeaders });
      } else if (/^0\d+$/.test(phone) && phone.length >= 7) {
        return Response.json({
          answer: `เบอร์ "${phone}" ดูไม่ตรงรูปแบบเบอร์ไทยค่ะ (มือถือ 10 หลัก ขึ้นต้น 06/08/09 หรือ เบอร์บ้าน 9 หลัก ขึ้นต้น 02-07) รบกวนทวนใหม่นะคะ`,
          confidence: 100, image_titles: [],
        }, { headers: corsHeaders });
      }
    }

    const [{ data: cfgArr }, { data: kb }, { data: pkgs }, { data: promos }] = await Promise.all([
      supabase.from("app_settings").select("*").eq("key", "ai_config").limit(1),
      supabase.from("knowledge_base").select("*").eq("status", "active").order("sort_order"),
      supabase.from("catering_packages").select("*").eq("is_active", true),
      supabase.from("promotions").select("*").eq("is_active", true),
    ]);
    const cfg = cfgArr?.[0] || {};

    const kbContext = (kb || []).map((k: any) => {
      const imgs = getItemImages(k);
      return `## ${k.title}\n${(k.content || "").slice(0, 800)}${imgs.length ? `\n[มีรูป ${imgs.length} รูป]` : ""}`;
    }).join("\n\n");

    const pkgContext = (pkgs || []).length > 0 ? "\n\n--- แคตตาล็อกแพ็กเกจ ---\n" + (pkgs || []).map((p: any) => {
      let s = `## แพ็กเกจ: ${p.name}`;
      if (p.category) s += `\nประเภท: ${p.category}`;
      if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
      if (p.pricing_tiers?.length > 0) {
        s += "\nราคา:";
        p.pricing_tiers.forEach((t: any) => {
          const total = t.total_pax || 0, monk = t.monk_pax || 0, guest = t.guest_pax || (total - monk);
          const label = t.tier_name ? `[${t.tier_name}] ` : "";
          const imgFlag = t.image_url ? " 🖼️" : "";
          const capFlag = guest > 0 ? ` 【รับแขกได้สูงสุด ${guest} คน】` : "";
          const qLevels = Array.isArray(t.quality_levels) ? t.quality_levels.filter((q: any) => q?.name) : [];
          const hasQL = qLevels.length > 0;
          const priceShown = hasQL ? "(ดูระดับคุณภาพด้านล่าง)" : t.price;
          if (total > 0 && monk > 0) s += `\n  - ${label}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${priceShown}${imgFlag}${capFlag}`;
          else if (t.guest_count) s += `\n  - ${label}${t.guest_count}: ${priceShown}${imgFlag}${capFlag}`;
          else s += `\n  - ${label}${total || "?"} ท่าน: ${priceShown}${imgFlag}${capFlag}`;
          if (hasQL) {
            qLevels.forEach((q: any) => {
              const qImg = q.image_url ? " 🖼️" : "";
              const hl = q.highlights ? ` — ${q.highlights}` : "";
              s += `\n      • ${q.name}: ${q.price}${qImg}${hl}`;
            });
          }
        });
      }
      if (Array.isArray(p.custom_attributes) && p.custom_attributes.length > 0) {
        s += "\nข้อมูลเพิ่มเติม:";
        p.custom_attributes.forEach((a: any) => { if (a.label && a.value) s += `\n  - ${a.label}: ${a.value}`; });
      }
      if (p.description) s += `\nอาหาร: ${(p.description || "").slice(0, 300)}`;
      if (p.notes) s += `\nหมายเหตุ: ${p.notes.slice(0, 200)}`;
      if (p.ai_instruction) s += `\n🤖 คำสั่ง AI: ${p.ai_instruction}`;
      if (p.image_urls?.length > 0) s += `\n[มีรูป ${p.image_urls.length} รูป]`;
      return s;
    }).join("\n\n") : "";

    const promoContext = (promos || []).length > 0 ? "\n\n--- โปรโมชั่น ---\n" + (promos || []).map((pr: any) => {
      let s = `## โปรโมชั่น: ${pr.name}`;
      if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(", ")}`;
      if (pr.min_guests != null) s += `\nเงื่อนไข: ใช้กับงานตั้งแต่ ${pr.min_guests} ท่านขึ้นไป`;
      if (pr.description) s += `\n${pr.description}`;
      if (pr.image_urls?.length > 0) s += `\n[มีรูป ${pr.image_urls.length} รูป]`;
      return s;
    }).join("\n\n") + `\n\n⚠️ กฎเสนอโปรโมชั่น:
1. ก่อนเสนอโปร เช็คจำนวนแขกของลูกค้า เทียบกับเงื่อนไขขั้นต่ำของโปรนั้นเสมอ
2. ถ้าลูกค้ายังไม่บอกจำนวนแขก → เสนอได้แต่ต้องบอกเงื่อนไขควบคู่ (เช่น "โปร X สำหรับงาน 50 ท่านขึ้นไป")
3. ถ้าลูกค้าจำนวนน้อยกว่าเงื่อนไข → ห้ามเสนอโปรนั้นเด็ดขาด (เสนอตัวอื่นที่เข้าเกณฑ์ หรือไม่เสนอเลย)
4. เสนอโปรต้องบอกชื่อโปรเต็มทุกครั้ง ห้ามพูดลอยๆ ว่า "มีโปรนะคะ"` : "";

    const tierImageRefs: { title: string; url: string }[] = [];
    (pkgs || []).forEach((p: any) => {
      (p.pricing_tiers || []).forEach((t: any) => {
        if (t.image_url && t.tier_name) tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name}`, url: t.image_url });
        if (Array.isArray(t.quality_levels)) {
          t.quality_levels.forEach((q: any) => {
            if (q?.image_url && q?.name && t.tier_name) {
              tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name} — ${q.name}`, url: q.image_url });
            }
          });
        }
      });
    });
    const imageSources = [
      ...(kb || []).filter((i: any) => getItemImages(i).length > 0).map((i: any) => `"${i.title}"`),
      ...(pkgs || []).filter((p: any) => p.image_urls?.length > 0).map((p: any) => `"แพ็กเกจ: ${p.name}"`),
      ...tierImageRefs.map(r => `"${r.title}"`),
      ...(promos || []).filter((pr: any) => pr.image_urls?.length > 0).map((pr: any) => `"โปรโมชั่น: ${pr.name}"`),
      ...(kb || []).filter((i: any) => getItemVideos(i).length > 0).map((i: any) => `"VDO: ${i.title}"`),
      ...(pkgs || []).filter((p: any) => getItemVideos(p).length > 0).map((p: any) => `"VDO แพ็กเกจ: ${p.name}"`),
      ...(promos || []).filter((pr: any) => getItemVideos(pr).length > 0).map((pr: any) => `"VDO โปรโมชั่น: ${pr.name}"`),
    ];
    const imageListStr = imageSources.length ? `\n\n📚 รายชื่อสื่อที่ส่งได้ (ต้อง copy ชื่อนี้เป๊ะตัวอักษร ห้ามย่อ ห้ามแต่งใหม่): ${imageSources.join(", ")}\n(ใช้ชื่อเต็ม "แพ็กเกจ: X — tier Y" สำหรับรูป tier / "VDO: ..." สำหรับวิดีโอ — ส่งวิดีโอเฉพาะเมื่อลูกค้าขอดูบรรยากาศจริง)\n\n🔴 image_titles ต้องตรงกับรายการด้านบนเป๊ะ — ใส่ "บุฟเฟ่ต์"/"ซุ้มอาหาร"/"โต๊ะจีน" เฉยๆ = ผิด ไม่ได้รูป (ต้องเป็น "เมนูบุญ+บุฟเฟ่ต์", "แพ็กเกจ: ...", ฯลฯ)\n\n💡 กฎเลือก image_titles (ทำผิดบ่อย):\nA) ขอ "แพ็กเกจ"/"ราคา" หรือบอก "ประเภทงาน+จำนวนคน" → ส่งเฉพาะ "แพ็กเกจ: X" ที่เข้าเงื่อนไข ห้ามแถมเมนู/ตัวอย่าง\nB) ขอ "เมนูแนะนำ" → ส่ง "เซ็ตเมนูแนะนำสำหรับลูกค้าบุญ+บุฟเฟ่ต์" ตัวเดียว\nC) ขอ "เมนู" เฉยๆ → ถามประเภทก่อน ห้ามส่งหมด\nD) ขอ "เมนูทุกแบบ/ทั้งหมด" → ส่ง "เมนูบุญ+บุฟเฟ่ต์" + "เมนูบุญ+ซุ้มอาหาร" + "เมนูบุญ+โต๊ะจีน"\nE) ขอ "ตัวอย่างจัดงาน บ้าน+บริษัท" → ส่ง "ตัวอย่างรูปแบบการจัดพิธีสงฆ์ แบบ บ้านหรือครบรอบ" + "ตัวอย่างรูปแบบการจัดพิธีสงฆ์ แบบ บริษัท/ออฟฟิศ"\nF) สูงสุด 4 ชื่อ — ทุกชื่อต้องอยู่ในรายการสื่อด้านบน` : "";

    const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
      ? cfg.strict_rules.filter((r: string) => r?.trim()).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") : "";
    const strictSection = strictRules ? `\n\n⚠️ กฎเข้มงวด:\n${strictRules}` : "";

    const recentMsgs = history.slice(-8).map(h =>
      `${h.role === "user" ? "ลูกค้า" : "AI"}: ${h.content}`
    ).join("\n");

    // สแกน history หาข้อมูลที่ลูกค้าให้ไปแล้ว เพื่อให้ AI ไม่ถามซ้ำ
    const allCustomerText = [text, ...history.filter(h => h.role === "user").map(h => h.content)].join(" ");
    const knownFacts: string[] = [];
    const guestM = allCustomerText.match(/(\d{1,4})\s*(ท่าน|คน|ที่)/);
    if (guestM) knownFacts.push(`จำนวนแขก: ${guestM[1]} ${guestM[2]}`);
    const provinces = ["กทม","กรุงเทพ","นนทบุรี","ปทุมธานี","สมุทรปราการ","สมุทรสาคร","นครปฐม","เชียงใหม่","ขอนแก่น","ชลบุรี","ระยอง","ภูเก็ต","อุดรธานี","นครราชสีมา","อยุธยา"];
    const foundProv = provinces.find(p => allCustomerText.includes(p));
    if (foundProv) knownFacts.push(`สถานที่: ${foundProv}`);
    const dateM = allCustomerText.match(/(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา)/);
    if (dateM) knownFacts.push(`วันจัดงาน: ${dateM[0]}`);
    const eventTypes = ["บุญบ้าน","ทำบุญ","งานบุญ","งานแต่ง","งานบวช","งานศพ","ขึ้นบ้านใหม่","ครบรอบ"];
    const foundEvent = eventTypes.find(e => allCustomerText.includes(e));
    if (foundEvent) knownFacts.push(`ประเภทงาน: ${foundEvent}`);
    const knownFactsStr = knownFacts.length
      ? `\n\n📌 ข้อมูลที่ลูกค้าให้แล้ว (ห้ามถามซ้ำเด็ดขาด):\n- ${knownFacts.join("\n- ")}`
      : "";

    const prompt = `คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย เป็นกันเอง ใช้ "ค่ะ/นะคะ" ลงท้ายเบาๆ

🔴 กฎทองห้ามผิดเด็ดขาด (สำคัญที่สุด):
1. คำขึ้นต้น **ห้ามใช้ "ยินดีด้วยค่ะ/ครับ"** เด็ดขาด ("ยินดีด้วย" = แสดงความยินดีในโอกาสพิเศษเช่นแต่งงาน/รับปริญญาเท่านั้น)
   ใช้ "ยินดีค่ะ", "รับทราบค่ะ", "ได้เลยค่ะ", "สวัสดีค่ะ" แทน
2. ใช้ **"ค่ะ/คะ"** เท่านั้นในทุกข้อความ ห้ามสลับ "ครับ" เด็ดขาด
3. **ห้ามถามข้อมูลซ้ำ** ที่ลูกค้าเคยให้ไปแล้ว (ดูจาก "ข้อมูลที่ลูกค้าให้แล้ว" ด้านล่าง)
4. กรณีจำนวนแขกเป็นเศษ → เสนอ **แค่ทางเดียว** ต่อรอบ:
   - ค่าเริ่มต้น: เสนอ tier สูงกว่าให้พอดี
   - เสนอแบบ "ใช้ tier ต่ำกว่า + จ่ายเพิ่มต่อหัว" **เฉพาะเมื่อลูกค้าขอแบบประหยัดเอง**เท่านั้น
   - **ห้ามยัดทั้งสองทางในข้อความเดียว** และ **ห้ามแต่งราคาต่อหัว** — ถ้าลูกค้าถาม ตอบ "ทีมงานจะคำนวณให้ค่ะ"

🚫 ANTI-HALLUCINATION (สำคัญมาก):
- ตอบจาก KB เท่านั้น ห้ามแต่ง ห้ามเดา ห้ามจำจากความรู้ทั่วไป
- รูปแบบอาหารที่เรามี = **บุฟเฟ่ต์, ซุ้มอาหาร, โต๊ะจีน เท่านั้น** (ดู category ของแพ็กเกจ)
- ❌ ห้ามพูดถึง "ค็อกเทล", "คอฟฟี่เบรก", "ค็อกเทลปาร์ตี้", "fine dining" หรืออาหารประเภทอื่นที่ไม่อยู่ใน KB เด็ดขาด
- ห้ามแต่งชื่อเมนู ชื่อแพ็กเกจ ชื่อบริการที่ไม่มีใน KB/แคตตาล็อก
- ถ้าไม่แน่ใจ → "ขอส่งต่อทีมงานนะคะ"

กฎหลัก:
- ห้ามแต่งราคา/ตัวเลข
- ถ้าลูกค้าระบุรูปแบบบริการชัดเจน (เช่น โต๊ะจีน/บุฟเฟ่ต์/ซุ้มอาหาร) → เลือกเฉพาะแพ็กเกจ category นั้นก่อน ห้ามย้อนเลือกแพ็กคนละประเภท
- ถ้าลูกค้าบอก "แขก N" = แขก N คน ไม่รวมพระ → เลือก tier ที่ 【รับแขกได้สูงสุด】 ≥ N เท่านั้น ห้ามถามซ้ำว่า "รวมพระหรือยัง"
- เมื่อ tier ที่รองรับมีระดับคุณภาพ Standard/Premium/Elite → เสนอครบทุกระดับพร้อมราคา ห้ามเลือกให้เอง ห้ามใช้ราคา tier รวมแทนราคา quality_levels
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ลำดับเก็บข้อมูล: ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → ขอเบอร์โทร (ข้ามข้อที่ลูกค้าให้แล้ว)
- 🔴 ได้ข้อมูล 2+ → ขอเบอร์ทันที / สนทนาครบ 3 รอบ → ต้องขอเบอร์
- ทักทายกว้างๆ → ต้อนรับแล้วถามสนใจงานแบบไหน
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 🚫 ห้ามเสนอแพ็กเกจที่ไม่ตรงเงื่อนไขขั้นต่ำ (min_condition) เด็ดขาด
- 📸 ทุกครั้งที่พูดถึง/แนะนำแพ็กเกจใด ใส่ "แพ็กเกจ: <ชื่อ>" ลงใน image_titles เพื่อส่งรูปพื้นฐาน
- ⚠️ รูป tier (ชื่อมี " — "): ส่งได้**เฉพาะเมื่อ tier นั้นตรงกับจำนวนท่านที่ลูกค้าระบุเท่านั้น**${strictSection}${knownFactsStr}

KB:
${kbContext || "(ว่าง)"}
${pkgContext}
${promoContext}
${imageListStr}

สนทนา:
${recentMsgs || "(ใหม่)"}

ลูกค้า: "${text}"

⚠️ ก่อนตอบ ตรวจ 6 ข้อ:
(1) ขึ้นต้นด้วย "ยินดีด้วย" หรือเปล่า? → ถ้าใช่ เปลี่ยน
(2) มี "ครับ" ปนหรือเปล่า? → ถ้าใช่ เปลี่ยนเป็น "ค่ะ/คะ"
(3) ถามข้อมูลที่อยู่ใน "ข้อมูลที่ลูกค้าให้แล้ว" หรือเปล่า? → ถ้าใช่ ลบทิ้ง
(4) เสนอ 2 ทางเลือก (เสนอ tier สูงกว่า + เสนอจ่ายเพิ่มต่อหัว) ในข้อความเดียวหรือเปล่า? → ถ้าใช่ เก็บแค่ทางเดียว
(5) มี "ค็อกเทล/คอฟฟี่เบรก/fine dining" หรืออาหารที่ไม่ใช่บุฟเฟ่ต์/ซุ้ม/โต๊ะจีนปนมา? → ลบทิ้ง
(6) ลูกค้าขอ "เมนูแนะนำ" / "ขอแพ็กเกจ" / "ตัวอย่างจัดงาน" / "เมนูทุกแบบ"? → ต้องใส่ image_titles ให้ตรง (ห้ามปล่อยว่าง แม้จะถามต่อ)

ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎ A-F)`;

    let aiResp: any;
    try { aiResp = await callAI(prompt, "google/gemini-3-flash-preview"); }
    catch (e: any) {
      console.warn(`gemini-3-flash failed: ${e.message}, trying gemini-2.5-flash`);
      aiResp = await callAI(prompt, "google/gemini-2.5-flash");
    }

    // Resolve image/video titles → URLs
    const imageTitles: string[] = Array.isArray(aiResp.image_titles) ? aiResp.image_titles : [];
    const lookup: Record<string, string[]> = {};
    (kb || []).forEach((i: any) => {
      lookup[`"${i.title}"`] = getItemImages(i);
      lookup[`"VDO: ${i.title}"`] = getItemVideos(i).map(v => v.thumb_url);
    });
    (pkgs || []).forEach((p: any) => {
      lookup[`"แพ็กเกจ: ${p.name}"`] = p.image_urls || [];
      lookup[`"VDO แพ็กเกจ: ${p.name}"`] = getItemVideos(p).map(v => v.thumb_url);
    });
    (promos || []).forEach((pr: any) => {
      lookup[`"โปรโมชั่น: ${pr.name}"`] = pr.image_urls || [];
      lookup[`"VDO โปรโมชั่น: ${pr.name}"`] = getItemVideos(pr).map(v => v.thumb_url);
    });
    tierImageRefs.forEach(r => { lookup[`"${r.title}"`] = [r.url]; });
    // Build entries with searchable keywords (title + category + name)
    type Entry = { title: string; urls: string[]; haystack: string };
    const allEntries: Entry[] = [];
    (kb || []).forEach((i: any) => allEntries.push({
      title: i.title, urls: getItemImages(i),
      haystack: `${i.title} ${i.category || ""}`.toLowerCase()
    }));
    (pkgs || []).forEach((p: any) => allEntries.push({
      title: `แพ็กเกจ: ${p.name}`, urls: p.image_urls || [],
      haystack: `แพ็กเกจ ${p.name} ${p.category || ""}`.toLowerCase()
    }));
    (promos || []).forEach((pr: any) => allEntries.push({
      title: `โปรโมชั่น: ${pr.name}`, urls: pr.image_urls || [],
      haystack: `โปรโมชั่น ${pr.name}`.toLowerCase()
    }));
    tierImageRefs.forEach(r => allEntries.push({ title: r.title, urls: [r.url], haystack: r.title.toLowerCase() }));

    function fuzzyMatch(needle: string): string[] {
      const n = needle.replace(/^["']|["']$/g, "").toLowerCase().trim();
      // exact
      const exact = allEntries.find(e => e.title.toLowerCase() === n);
      if (exact) return exact.urls;
      // keyword tokens (drop "แพ็กเกจ:", "โปรโมชั่น:")
      const stripped = n.replace(/^(แพ็กเกจ|โปรโมชั่น|vdo)\s*[:：]?\s*/g, "").trim();
      if (!stripped) return [];
      // contains either way
      const matches = allEntries.filter(e => e.haystack.includes(stripped) || stripped.includes(e.title.toLowerCase().replace(/^(แพ็กเกจ|โปรโมชั่น)\s*[:：]?\s*/g, "")));
      // For "เมนู ทุกแบบ" → no single match; pick KB items whose haystack contains key words
      if (matches.length) return matches[0].urls;
      // Last resort: if needle matches a clear category keyword, return all KB matching
      return [];
    }

    const imageUrls: string[] = [];
    for (const t of imageTitles) {
      let arr = lookup[t] || lookup[`"${t}"`] || [];
      if (!arr.length) arr = fuzzyMatch(t);
      arr.forEach((u: string) => { if (!imageUrls.includes(u)) imageUrls.push(u); });
    }

    return Response.json({
      answer: aiResp.answer || "ขออภัย ไม่สามารถตอบได้ในขณะนี้",
      confidence: aiResp.confidence ?? 80,
      image_titles: imageTitles,
      image_urls: imageUrls.slice(0, 12),
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
