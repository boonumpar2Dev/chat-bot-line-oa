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
    if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const text: string = (body.message || "").trim();
    const history: Array<{ role: string; content: string }> = body.history || [];
    if (!text) return Response.json({ error: "Missing message" }, { status: 400, headers: corsHeaders });

    // Phone validation — strict Thai format
    // Mobile: 10 digits, starts 06/08/09  | Landline: 9 digits, starts 02-07
    const pureDigits = text.replace(/[\s\-().+]/g, "");
    const isPureNumber = /^\d+$/.test(pureDigits);
    let phone: string | null = null;
    if (isPureNumber && pureDigits.length >= 7 && pureDigits.length <= 15) phone = pureDigits;
    else {
      const seqs = text.match(/\d[\d\s\-().]{6,25}\d/g) || [];
      for (const s of seqs) {
        const d = s.replace(/[^0-9]/g, "");
        if (d.length >= 7 && d.length <= 15) { phone = d; break; }
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
          if (total > 0 && monk > 0) s += `\n  - ${label}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${t.price}${imgFlag}`;
          else if (t.guest_count) s += `\n  - ${label}${t.guest_count}: ${t.price}${imgFlag}`;
          else s += `\n  - ${label}${total || "?"} ท่าน: ${t.price}${imgFlag}`;
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
      if (pr.description) s += `\n${pr.description}`;
      if (pr.image_urls?.length > 0) s += `\n[มีรูป ${pr.image_urls.length} รูป]`;
      return s;
    }).join("\n\n") : "";

    const tierImageRefs: { title: string; url: string }[] = [];
    (pkgs || []).forEach((p: any) => {
      (p.pricing_tiers || []).forEach((t: any) => {
        if (t.image_url && t.tier_name) tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name}`, url: t.image_url });
      });
    });
    const imageSources = [
      ...(kb || []).filter((i: any) => getItemImages(i).length > 0).map((i: any) => `"${i.title}"`),
      ...(pkgs || []).filter((p: any) => p.image_urls?.length > 0).map((p: any) => `"แพ็กเกจ: ${p.name}"`),
      ...tierImageRefs.map(r => `"${r.title}"`),
      ...(promos || []).filter((pr: any) => pr.image_urls?.length > 0).map((pr: any) => `"โปรโมชั่น: ${pr.name}"`),
    ];
    const imageListStr = imageSources.length ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${imageSources.join(", ")}\n(ถ้าลูกค้าถามเจาะจง tier/จำนวนคน → ใช้ชื่อเต็ม "แพ็กเกจ: X — tier Y" แทนชื่อแพ็กเกจรวม)` : "";

    const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
      ? cfg.strict_rules.filter((r: string) => r?.trim()).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") : "";
    const strictSection = strictRules ? `\n\n⚠️ กฎเข้มงวด:\n${strictRules}` : "";

    const recentMsgs = history.slice(-8).map(h =>
      `${h.role === "user" ? "ลูกค้า" : "AI"}: ${h.content}`
    ).join("\n");

    const prompt = `คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย กระชับ เป็นกันเอง ห้ามเกิน 150 คำ

กฎหลัก:
- ตอบจาก KB เท่านั้น ห้ามแต่งราคา/ตัวเลข
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ลำดับเก็บข้อมูล: ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → ขอเบอร์โทร
- 🔴 ได้ข้อมูล 2+ → ขอเบอร์ทันที / สนทนาครบ 3 รอบ → ต้องขอเบอร์
- ทักทายกว้างๆ → ต้อนรับแล้วถามสนใจงานแบบไหน
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 🚫 ห้ามเสนอแพ็กเกจที่ไม่ตรงเงื่อนไขขั้นต่ำ (min_condition) เด็ดขาด เช่น ลูกค้า 40 ท่าน ห้ามเสนอแพ็กเกจที่ระบุขั้นต่ำ 50 ท่าน
- 📸 ทุกครั้งที่พูดถึง/แนะนำแพ็กเกจใด ใส่ "แพ็กเกจ: <ชื่อ>" ลงใน image_titles เพื่อส่งรูปพื้นฐาน
- ⚠️ รูป tier (ชื่อมี " — "): ส่งได้**เฉพาะเมื่อ tier นั้นตรงกับจำนวนท่านที่ลูกค้าระบุเท่านั้น** ห้ามส่งรูป tier ที่จำนวนท่านไม่ตรงกับลูกค้าเด็ดขาด (เช่น ลูกค้า 40 ท่าน ห้ามส่งรูป tier "20 ท่าน")${strictSection}

KB:
${kbContext || "(ว่าง)"}
${pkgContext}
${promoContext}
${imageListStr}

สนทนา:
${recentMsgs || "(ใหม่)"}

ลูกค้า: "${text}"

ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 3)`;

    let aiResp: any;
    try { aiResp = await callAI(prompt, "google/gemini-3-flash-preview"); }
    catch (e: any) {
      console.warn(`gemini-3-flash failed: ${e.message}, trying gemini-2.5-flash`);
      aiResp = await callAI(prompt, "google/gemini-2.5-flash");
    }

    // Resolve image titles → URLs
    const imageTitles: string[] = Array.isArray(aiResp.image_titles) ? aiResp.image_titles : [];
    const lookup: Record<string, string[]> = {};
    (kb || []).forEach((i: any) => { lookup[`"${i.title}"`] = getItemImages(i); });
    (pkgs || []).forEach((p: any) => { lookup[`"แพ็กเกจ: ${p.name}"`] = p.image_urls || []; });
    (promos || []).forEach((pr: any) => { lookup[`"โปรโมชั่น: ${pr.name}"`] = pr.image_urls || []; });
    tierImageRefs.forEach(r => { lookup[`"${r.title}"`] = [r.url]; });
    const imageUrls: string[] = [];
    for (const t of imageTitles) {
      const arr = lookup[t] || lookup[`"${t}"`] || [];
      arr.forEach((u: string) => { if (!imageUrls.includes(u)) imageUrls.push(u); });
    }

    return Response.json({
      answer: aiResp.answer || "ขออภัย ไม่สามารถตอบได้ในขณะนี้",
      confidence: aiResp.confidence ?? 80,
      image_titles: imageTitles,
      image_urls: imageUrls.slice(0, 5),
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
