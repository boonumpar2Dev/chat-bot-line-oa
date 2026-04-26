import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
};

const processingIds = new Set<string>();
const AI_OFF_STATUSES = ["pending_quote", "pending_confirm", "confirmed"];
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const LINE_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function verifySignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === signature;
}

async function pushLine(to: string, messages: any[]) {
  return fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to, messages }),
  });
}

async function callAI(prompt: string): Promise<{ answer: string; confidence: number; image_titles?: string[]; confirm_existing_phone?: boolean }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              confidence: { type: "number" },
              image_titles: { type: "array", items: { type: "string" } },
              confirm_existing_phone: { type: "boolean" },
            },
            required: ["answer", "confidence", "image_titles", "confirm_existing_phone"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function uploadLineMedia(messageId: string, msgType: string, supabase: any): Promise<string | null> {
  try {
    const ext = msgType === "image" ? "jpg" : msgType === "video" ? "mp4" : msgType === "audio" ? "m4a" : "bin";
    const fileName = `${msgType}_${messageId}.${ext}`;
    const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    const { data, error } = await supabase.storage.from("line-media").upload(fileName, blob, { upsert: true, contentType: blob.type });
    if (error) { console.error("upload error", error); return null; }
    const { data: pub } = supabase.storage.from("line-media").getPublicUrl(data.path);
    return pub.publicUrl;
  } catch (e) {
    console.error("media upload failed", e);
    return null;
  }
}

async function processEvent(event: any, supabase: any) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  if (event.deliveryContext?.isRedelivery) return;

  // Standby mode = admin took over
  if (event.mode === "standby") {
    const { data: existing } = await supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1);
    const customer = existing?.[0];
    if (!customer) return;
    if (!customer.manual_chat_until || new Date(customer.manual_chat_until) < new Date()) {
      const { data: cfgArr } = await supabase.from("app_settings").select("manual_chat_hours").eq("key", "ai_config").limit(1);
      const manualHours = cfgArr?.[0]?.manual_chat_hours || 360;
      const until = new Date(Date.now() + manualHours * 3600000).toISOString();
      await supabase.from("customers").update({ ai_active: false, manual_chat_until: until }).eq("id", customer.id);
    }
    if (event.type === "message" && event.message) {
      let text = event.message.type === "text" ? event.message.text : `[${event.message.type}]`;
      await supabase.from("conversations").insert({ customer_id: customer.id, message: text, sender: "customer", line_message_id: event.message.id });
      await supabase.from("customers").update({
        unread_count: (customer.unread_count || 0) + 1,
        last_message_at: new Date().toISOString(),
        last_message_snippet: text.slice(0, 60),
      }).eq("id", customer.id);
    }
    return;
  }

  if (event.type !== "message") return;
  const msgType = event.message?.type;

  let messageText: string;
  let isText = false;

  if (msgType === "text") {
    messageText = event.message.text;
    isText = true;
  } else if (["image", "video", "audio", "file"].includes(msgType)) {
    const label = msgType === "image" ? "รูปภาพ" : msgType === "video" ? "วิดีโอ" : msgType === "audio" ? "เสียง" : "ไฟล์";
    const fileUrl = await uploadLineMedia(event.message.id, msgType, supabase);
    messageText = fileUrl ? `[${label}]\n📎 ${fileUrl}` : `[${label}]`;
  } else if (msgType === "sticker") {
    const stkId = event.message.stickerId;
    messageText = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${stkId}/android/sticker.png`;
  } else if (msgType === "location") {
    messageText = `[ตำแหน่ง: ${event.message.title || event.message.address || "ไม่ระบุ"}]`;
  } else {
    messageText = `[${msgType || "ไม่ทราบ"}]`;
  }

  // Find or create customer
  const { data: existing } = await supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1);
  let customer = existing?.[0];
  if (!customer) {
    const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const { data: created } = await supabase.from("customers").insert({
      line_user_id: lineUserId,
      display_name: profile.displayName || "ลูกค้าใหม่",
      picture_url: profile.pictureUrl || "",
      status: "new",
      ai_active: true,
    }).select().single();
    customer = created;
  }

  // Dedup
  const lineMsgId = event.message?.id;
  if (lineMsgId) {
    if (processingIds.has(lineMsgId)) return;
    processingIds.add(lineMsgId);
    setTimeout(() => processingIds.delete(lineMsgId), 60000);
  }

  const snippet = messageText.replace(/\[.*?\]\n?/, "").replace(/📎\s*\S+/g, "").trim().slice(0, 60) || messageText.slice(0, 60);
  await supabase.from("conversations").insert({ customer_id: customer.id, message: messageText, sender: "customer", line_message_id: lineMsgId });
  await supabase.from("customers").update({
    unread_count: (customer.unread_count || 0) + 1,
    last_message_at: new Date().toISOString(),
    last_message_snippet: snippet,
  }).eq("id", customer.id);

  if (!isText) return;

  const trimmed = messageText.trim().toLowerCase();
  const trivial = ["👍", "👌", "ok", "oki", "ได้เลย", "โอเค", "ขอบคุณ", "ขอบคุณค่ะ", "ขอบคุณครับ", "ค่ะ", "ครับ", "ดีค่ะ", "ดีครับ"];
  if (trimmed.length <= 3 && !trimmed.match(/[?？]/)) return;
  if (trivial.includes(trimmed)) return;

  const [{ data: cfgArr }, { data: freshArr }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("key", "ai_config").limit(1),
    supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1),
  ]);
  const cfg = cfgArr?.[0] || {};
  const freshCustomer = freshArr?.[0] || customer;

  // Phone detection
  const pureDigits = messageText.replace(/[\s\-().+]/g, "");
  const isPure = /^\d+$/.test(pureDigits);
  const phoneSeqs = messageText.match(/\d[\d\s\-().]{6,25}\d/g) || [];
  let phone: string | null = null;
  if (isPure && pureDigits.length >= 7 && pureDigits.length <= 15) phone = pureDigits;
  else for (const s of phoneSeqs) {
    const d = s.replace(/[^0-9]/g, "");
    if (d.length >= 7 && d.length <= 15) { phone = d; break; }
  }
  if (phone && messageText.replace(/[0-9\s\-().+]/g, "").trim().length > 15) phone = null;
  if (phone && /^66\d{8,9}$/.test(phone)) phone = "0" + phone.slice(2);

  if (phone && /^0\d{8,9}$/.test(phone)) {
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      phone, ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    const fmt = phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    const lines = [`ขอบคุณสำหรับข้อมูลครับ บันทึกเบอร์โทร ${fmt} เรียบร้อยแล้ว`, "", "จะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยครับ"];
    const text = lines.join("\n");
    await pushLine(lineUserId, [{ type: "text", text }]);
    await supabase.from("conversations").insert({ customer_id: customer.id, message: text, sender: "ai" });
    await supabase.from("customers").update({ last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${text.slice(0, 60)}` }).eq("id", customer.id);
    return;
  }

  // Safety gates
  if (!freshCustomer.ai_active) return;
  if (freshCustomer.manual_chat_until && new Date(freshCustomer.manual_chat_until) > new Date()) return;
  if (freshCustomer.ai_resumed_at) {
    const msgMs = typeof event.timestamp === "number" ? event.timestamp : 0;
    if (msgMs > 0 && msgMs < new Date(freshCustomer.ai_resumed_at).getTime()) return;
  }
  if (AI_OFF_STATUSES.includes(freshCustomer.status)) return;
  if (cfg.ai_enabled === false) return;

  // Schedule
  if (cfg.schedule_enabled) {
    const bkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const hhmm = bkk.getHours() * 60 + bkk.getMinutes();
    const [sh, sm] = (cfg.start_time || "18:00").split(":").map(Number);
    const [eh, em] = (cfg.end_time || "08:00").split(":").map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    const inWindow = start > end ? (hhmm >= start || hhmm < end) : (hhmm >= start && hhmm < end);
    if (!inWindow) return;
  }

  // Fetch AI context
  const [{ data: recentConvs }, { data: pkgs }, { data: promos }] = await Promise.all([
    supabase.from("conversations").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("catering_packages").select("*").eq("is_active", true),
    supabase.from("promotions").select("*").eq("is_active", true),
  ]);

  const cooldownMs = (cfg.cooldown_minutes || 1) * 60 * 1000;
  const lastAdmin = [...(recentConvs || [])].reverse().find((m: any) => m.sender === "admin");
  if (lastAdmin && Date.now() - new Date(lastAdmin.created_at).getTime() < cooldownMs) return;

  const pkgContext = (pkgs || []).map((p: any) => {
    let s = `## แพ็กเกจ: ${p.name}`;
    if (p.category) s += `\nประเภท: ${p.category}`;
    if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
    if (p.pricing_tiers?.length > 0) {
      s += "\nราคา:";
      p.pricing_tiers.forEach((t: any) => {
        const total = t.total_pax || 0, monk = t.monk_pax || 0, guest = t.guest_pax || (total - monk);
        const label = t.tier_name ? `[${t.tier_name}] ` : "";
        if (total > 0 && monk > 0) s += `\n  - ${label}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${t.price}`;
        else s += `\n  - ${label}${total || "?"} ท่าน: ${t.price}`;
      });
    }
    if (p.description) s += `\nอาหาร: ${(p.description || "").slice(0, 300)}`;
    if (p.notes) s += `\nหมายเหตุ: ${(p.notes || "").slice(0, 200)}`;
    if (p.ai_instruction) s += `\n🤖 คำสั่ง AI: ${p.ai_instruction}`;
    if (p.image_urls?.length > 0) s += `\n[มีรูป ${p.image_urls.length} รูป]`;
    return s;
  }).join("\n\n");

  const promoContext = (promos || []).map((pr: any) => {
    let s = `## โปรโมชั่น: ${pr.name}`;
    if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(", ")}`;
    if (pr.description) s += `\n${pr.description}`;
    return s;
  }).join("\n\n");

  const pkgsWithImages = (pkgs || []).filter((p: any) => p.image_urls?.length > 0);
  const promosWithImages = (promos || []).filter((pr: any) => pr.image_urls?.length > 0);
  const allImageSources = [
    ...pkgsWithImages.map((p: any) => `"แพ็กเกจ: ${p.name}"`),
    ...promosWithImages.map((pr: any) => `"โปรโมชั่น: ${pr.name}"`),
  ];
  const imageListStr = allImageSources.length ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${allImageSources.join(", ")}` : "";

  const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
    ? cfg.strict_rules.filter((r: string) => r?.trim()).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") : "";
  const strictRulesSection = strictRules ? `\n\n⚠️ กฎเข้มงวด:\n${strictRules}` : "";

  let history = [...(recentConvs || [])].reverse();
  const lastAdminIdx = history.map((m, i) => m.sender === "admin" ? i : -1).filter(i => i >= 0).pop();
  if (lastAdminIdx !== undefined) history = history.slice(lastAdminIdx);
  else history = history.slice(-6);
  const recentMsgs = history.map((m: any) => `${m.sender === "customer" ? "ลูกค้า" : m.sender === "admin" ? "แอดมิน" : "AI"}: ${m.message}`).join("\n");

  const hasPhone = !!freshCustomer.phone;
  const fmtPhone = hasPhone ? freshCustomer.phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : "";
  const returningPrompt = hasPhone ? `\n\n🔵 ลูกค้ามีเบอร์แล้ว: ${fmtPhone}\n- ตอบคำถามก่อน เก็บข้อมูลเพิ่ม (ประเภทงาน/จำนวน/สถานที่)\n- ได้ข้อมูล 2 อย่าง → ถามว่า "ติดต่อกลับเบอร์ ${fmtPhone} เลยไหม?"\n- ลูกค้ายืนยัน → set confirm_existing_phone: true` : "";

  const prompt = `คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย กระชับ เป็นกันเอง ห้ามเกิน 150 คำ

กฎ:
- ตอบจาก KB เท่านั้น ห้ามแต่งราคา
- เก็บข้อมูล: ประเภทงาน → สถานที่ → จำนวน → วันจัด → เบอร์โทร
- ได้ข้อมูล 2+ → ขอเบอร์
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
${returningPrompt}${strictRulesSection}

${pkgContext}

${promoContext}
${imageListStr}

สนทนา:
${recentMsgs || "(ใหม่)"}

ลูกค้า: "${messageText}"

ตอบเป็น JSON: answer, confidence (0-100), image_titles (สูงสุด 3), confirm_existing_phone`;

  let aiResp: any;
  try { aiResp = await callAI(prompt); }
  catch (e) { console.error("AI failed", e); return; }

  const confidence = typeof aiResp.confidence === "number" ? aiResp.confidence : 85;
  const threshold = cfg.confidence_threshold || 75;

  if (confidence < threshold) {
    const fbText = cfg.fallback_message || "ขอบคุณที่ติดต่อมาค่ะ เจ้าหน้าที่จะรีบติดต่อกลับนะคะ 🙏";
    const muteH = cfg.fallback_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
    await pushLine(lineUserId, [{ type: "text", text: fbText }]);
    await supabase.from("conversations").insert({ customer_id: customer.id, message: fbText, sender: "ai", confidence_score: confidence, is_fallback: true });
    await supabase.from("customers").update({
      ai_active: false, manual_chat_until: muteUntil,
      last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${fbText.slice(0, 60)}`,
    }).eq("id", customer.id);
    return;
  }

  const answerText = String(aiResp.answer || "ขออภัย ไม่สามารถตอบได้").replace(/\n{3,}/g, "\n\n").trim().slice(0, 5000);
  const imageTitles: string[] = aiResp.image_titles || [];

  if (aiResp.confirm_existing_phone && hasPhone) {
    const muteH = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + muteH * 3600000).toISOString();
    await pushLine(lineUserId, [{ type: "text", text: answerText }]);
    await supabase.from("conversations").insert({ customer_id: customer.id, message: answerText, sender: "ai", confidence_score: confidence });
    await supabase.from("customers").update({
      ai_active: false, manual_chat_until: muteUntil,
      last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${answerText.slice(0, 60)}`,
    }).eq("id", customer.id);
    return;
  }

  // Image dedup
  const pkgImgs = pkgsWithImages.filter((p: any) => imageTitles.includes(`แพ็กเกจ: ${p.name}`));
  const promoImgs = promosWithImages.filter((pr: any) => imageTitles.includes(`โปรโมชั่น: ${pr.name}`));
  const allImgs = [...pkgImgs, ...promoImgs].flatMap((x: any) => x.image_urls || []).slice(0, 3);
  const lastSent = Array.isArray(customer.last_sent_image_titles) ? customer.last_sent_image_titles : [];
  const sameTitles = [...imageTitles].sort().join("|") === [...lastSent].sort().join("|") && imageTitles.length > 0;
  const imagesToSend = sameTitles ? [] : allImgs;

  const lineMessages: any[] = [{ type: "text", text: answerText }];
  for (const url of imagesToSend) {
    lineMessages.push({ type: "image", originalContentUrl: url, previewImageUrl: url });
  }
  await pushLine(lineUserId, lineMessages);

  const savedMsg = imagesToSend.length > 0 ? `${answerText}\n${imagesToSend.map(u => `📎 ${u}`).join("\n")}` : answerText;
  const update: any = {
    last_message_at: new Date().toISOString(),
    last_message_snippet: `🤖 ${answerText.slice(0, 60)}`,
  };
  if (imageTitles.length > 0) update.last_sent_image_titles = imageTitles;
  await supabase.from("conversations").insert({ customer_id: customer.id, message: savedMsg, sender: "ai", confidence_score: confidence });
  await supabase.from("customers").update(update).eq("id", customer.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.text();
    const signature = req.headers.get("x-line-signature") || "";
    if (LINE_SECRET && signature && !(await verifySignature(body, signature, LINE_SECRET))) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    const { events = [] } = JSON.parse(body || "{}");
    if (events.length === 0) return Response.json({ ok: true });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const work = (async () => {
      for (const ev of events) {
        try { await processEvent(ev, supabase); }
        catch (e: any) { console.error("processEvent error:", e.message); }
      }
    })();
    // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else work.catch(e => console.error(e));

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("webhook error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
