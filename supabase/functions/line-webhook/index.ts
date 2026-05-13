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
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!r.ok) console.error(`[PushFailed] ${r.status}: ${await r.text()}`);
  return r;
}

function getItemImages(item: any): string[] {
  return Array.isArray(item.image_urls) ? [...item.image_urls] : [];
}

async function callAI(prompt: string, model = "google/gemini-3-flash-preview"): Promise<{ answer: string; confidence: number; image_titles?: string[]; confirm_existing_phone?: boolean; intent?: { event_type?: string | null; venue?: string | null; guest_count?: number | null; event_date?: string | null } }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model,
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
              intent: {
                type: "object",
                additionalProperties: false,
                properties: {
                  event_type: { type: ["string", "null"] },
                  venue: { type: ["string", "null"] },
                  guest_count: { type: ["number", "null"] },
                  event_date: { type: ["string", "null"] },
                },
                required: ["event_type", "venue", "guest_count", "event_date"],
              },
            },
            required: ["answer", "confidence", "image_titles", "confirm_existing_phone", "intent"],
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

async function sendAndSave(supabase: any, customerId: string, lineUserId: string, text: string, extra: Record<string, any> = {}) {
  await pushLine(lineUserId, [{ type: "text", text }]);
  await supabase.from("conversations").insert({ customer_id: customerId, message: text, sender: "ai", ...extra });
  await supabase.from("customers").update({
    last_message_at: new Date().toISOString(),
    last_message_snippet: `🤖 ${text.slice(0, 60)}`,
  }).eq("id", customerId);
}

async function processEvent(event: any, supabase: any) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  if (event.deliveryContext?.isRedelivery) return;

  console.log(`[Event] type=${event.type} mode=${event.mode} userId=${lineUserId}`);

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
      let text: string;
      if (event.message.type === "text") text = event.message.text;
      else if (event.message.type === "sticker") text = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
      else if (event.message.type === "location") text = `[ตำแหน่ง: ${event.message.title || event.message.address || "ไม่ระบุ"}]`;
      else {
        const label = event.message.type === "image" ? "รูปภาพ" : event.message.type === "video" ? "วิดีโอ" : event.message.type === "audio" ? "เสียง" : "ไฟล์";
        text = `[${label}]`;
      }
      await supabase.from("conversations").insert({ customer_id: customer.id, message: text, sender: "customer", line_message_id: event.message.id });
      const snippet = text.replace(/\[.*?\]\n?/, "").trim().slice(0, 60) || text.slice(0, 60);
      await supabase.from("customers").update({
        unread_count: (customer.unread_count || 0) + 1,
        last_message_at: new Date().toISOString(),
        last_message_snippet: snippet,
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
    messageText = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
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

  // 🕐 Debounce 15s: รอให้ลูกค้าพิมพ์เสร็จก่อนตอบ (กันกรณีพิมพ์หลายบรรทัดติดๆ กัน)
  // ถ้ามีข้อความใหม่จากลูกค้าเข้ามาในช่วง 15 วิ → ตัวเก่า skip ปล่อยตัวล่าสุดตอบรวมทีเดียว
  if (lineMsgId) {
    await new Promise(r => setTimeout(r, 15000));
    const { data: latestArr } = await supabase
      .from("conversations")
      .select("line_message_id")
      .eq("customer_id", customer.id)
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(1);
    const latest = latestArr?.[0];
    if (latest && latest.line_message_id && latest.line_message_id !== lineMsgId) {
      console.log(`[Debounce] skip ${lineMsgId} — newer customer message arrived`);
      return;
    }
  }

  const trimmed = messageText.trim().toLowerCase();
  // Skip only pure acknowledgements (ไม่ใช่ทักทาย เพราะทักทายต้องตอบกลับ+ถาม)
  const trivial = [
    "👍", "👌", "🙏", "❤️", "ok", "oki", "okay",
    "ได้เลย", "โอเค", "ขอบคุณ", "ขอบคุณค่ะ", "ขอบคุณครับ",
    "ค่ะ", "คะ", "ครับ", "คับ", "ดีค่ะ", "ดีครับ"
  ];
  if (trivial.includes(trimmed)) return;

  const [{ data: cfgArr }, { data: freshArr }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("key", "ai_config").limit(1),
    supabase.from("customers").select("*").eq("line_user_id", lineUserId).limit(1),
  ]);
  const cfg = cfgArr?.[0] || {};
  const freshCustomer = freshArr?.[0] || customer;

  // Phone detection — collect ALL candidates
  const pureDigits = messageText.replace(/[\s\-().+]/g, "");
  const isPure = /^\d+$/.test(pureDigits);
  const phoneSeqs = messageText.match(/\d[\d\s\-().]{6,25}\d/g) || [];

  const candidates: string[] = [];
  if (isPure && pureDigits.length >= 7 && pureDigits.length <= 15) {
    candidates.push(pureDigits);
  } else {
    for (const s of phoneSeqs) {
      const d = s.replace(/[^0-9]/g, "");
      if (d.length >= 7 && d.length <= 15) candidates.push(d);
    }
  }
  // Normalize +66/66 → 0
  const normalized = candidates.map(p => /^66\d{8,9}$/.test(p) ? "0" + p.slice(2) : p);

  // เบอร์ไทย valid (ขึ้นต้น 0, 9-10 หลัก) → เก็บเสมอ ไม่ว่าข้อความยาวแค่ไหน
  const validPhones = Array.from(new Set(normalized.filter(p => /^0\d{8,9}$/.test(p))));

  // Invalid phone-like: ถามใหม่ ก็ต่อเมื่อข้อความสั้นและดูเหมือนตั้งใจให้เบอร์ (กันเก็บเลขสุ่มจากแชททั่วไป)
  const nonDigit = messageText.replace(/[0-9\s\-().+]/g, "").trim();
  const looksLikePhoneIntent = nonDigit.length <= 40;
  const invalidPhones = (validPhones.length === 0 && looksLikePhoneIntent)
    ? normalized.filter(p => !/^0\d{8,9}$/.test(p))
    : [];
  

  if (validPhones.length > 0) {
    // Save ALL valid phones (comma-separated). Merge with existing if any.
    const existingPhones = (freshCustomer.phone || "").split(/[,\s]+/).filter((p: string) => /^0\d{8,9}$/.test(p));
    const allPhones = Array.from(new Set([...existingPhones, ...validPhones]));
    const phoneStr = allPhones.join(", ");
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      phone: phoneStr, ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    const fmtList = validPhones.map(p => p.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"));
    const fmtStr = fmtList.length === 1 ? fmtList[0] : fmtList.join(", ");
    const lines = [
      validPhones.length === 1
        ? `ขอบคุณสำหรับข้อมูลครับ บันทึกเบอร์โทร ${fmtStr} เรียบร้อยแล้ว`
        : `ขอบคุณสำหรับข้อมูลครับ บันทึกเบอร์โทรทั้ง ${validPhones.length} เบอร์เรียบร้อยแล้ว: ${fmtStr}`,
      "",
      "จะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยครับ",
      "",
      "📋 สรุปข้อมูลที่ได้รับ:",
      `- เบอร์โทร: ${fmtStr}`,
    ];
    if (freshCustomer.event_type) lines.push(`- ประเภทงาน: ${freshCustomer.event_type}`);
    if (freshCustomer.venue) lines.push(`- สถานที่/จังหวัด: ${freshCustomer.venue}`);
    if (freshCustomer.event_date) lines.push(`- วันจัดงาน: ${freshCustomer.event_date}`);
    if (freshCustomer.guest_count) lines.push(`- จำนวนคน: ${freshCustomer.guest_count} ท่าน`);
    await sendAndSave(supabase, customer.id, lineUserId, lines.join("\n"));
    return;
  }

  // Invalid phone-like: ไม่เก็บ + ถามนุ่มๆ
  if (invalidPhones.length > 0) {
    const bad = invalidPhones[0];
    const text = `ขอเบอร์อีกครั้งได้ไหมครับ เบอร์ที่ให้มา "${bad}" เหมือนจะไม่ครบ 10 หลักนะครับ 🙏\n\nเบอร์โทรศัพท์ไทยขึ้นต้นด้วย 0 และมี 9-10 หลัก เช่น 081-234-5678`;
    await sendAndSave(supabase, customer.id, lineUserId, text);
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

  // Fetch AI context (KB + packages + promos + history)
  const [{ data: recentConvs }, { data: kb }, { data: pkgs }, { data: promos }] = await Promise.all([
    supabase.from("conversations").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("knowledge_base").select("*").eq("status", "active").order("sort_order", { ascending: true }),
    supabase.from("catering_packages").select("*").eq("is_active", true),
    supabase.from("promotions").select("*").eq("is_active", true),
  ]);

  const cooldownMs = (cfg.cooldown_minutes || 1) * 60 * 1000;
  const lastAdmin = [...(recentConvs || [])].reverse().find((m: any) => m.sender === "admin");
  if (lastAdmin && Date.now() - new Date(lastAdmin.created_at).getTime() < cooldownMs) return;

  // KB context
  const kbItems = kb || [];
  const kbWithImages = kbItems.filter((i: any) => getItemImages(i).length > 0);
  const kbContext = kbItems.map((k: any) => {
    const imgs = getItemImages(k);
    const content = (k.content || "").slice(0, 800);
    const cat = k.category ? `[${k.category}] ` : "";
    return `## ${cat}${k.title}\n${content}${imgs.length > 0 ? `\n[มีรูป ${imgs.length} รูป]` : ""}`;
  }).join("\n\n");

  // Package context (with custom_attributes + tier.guest_count fallback)
  const pkgsWithImages = (pkgs || []).filter((p: any) => p.image_urls?.length > 0);
  const pkgContext = (pkgs || []).length > 0 ? "\n\n--- แคตตาล็อกแพ็กเกจ ---\n" + (pkgs || []).map((p: any) => {
    let s = `## แพ็กเกจ: ${p.name}`;
    if (p.category) s += `\nประเภท: ${p.category}`;
    if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
    if (p.pricing_tiers?.length > 0) {
      s += "\nราคา:";
      p.pricing_tiers.forEach((t: any) => {
        const total = t.total_pax || 0, monk = t.monk_pax || 0, guest = t.guest_pax || (total - monk);
        const label = t.tier_name ? `[${t.tier_name}] ` : "";
        if (total > 0 && monk > 0) s += `\n  - ${label}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${t.price}`;
        else if (t.guest_count) s += `\n  - ${label}${t.guest_count}: ${t.price}`;
        else s += `\n  - ${label}${total || "?"} ท่าน: ${t.price}`;
      });
    }
    if (Array.isArray(p.custom_attributes) && p.custom_attributes.length > 0) {
      s += "\nข้อมูลเพิ่มเติม:";
      p.custom_attributes.forEach((a: any) => { if (a.label && a.value) s += `\n  - ${a.label}: ${a.value}`; });
    }
    if (p.description) s += `\nอาหาร: ${(p.description || "").slice(0, 300)}`;
    if (p.notes) s += `\nหมายเหตุ: ${(p.notes || "").slice(0, 200)}`;
    if (p.ai_instruction) s += `\n🤖 คำสั่ง AI: ${p.ai_instruction}`;
    if (p.image_urls?.length > 0) s += `\n[มีรูป ${p.image_urls.length} รูป]`;
    return s;
  }).join("\n\n") : "";

  const promosWithImages = (promos || []).filter((pr: any) => pr.image_urls?.length > 0);
  const promoContext = (promos || []).length > 0 ? "\n\n--- โปรโมชั่น ---\n" + (promos || []).map((pr: any) => {
    let s = `## โปรโมชั่น: ${pr.name}`;
    if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(", ")}`;
    if (pr.description) s += `\n${pr.description}`;
    if (pr.image_urls?.length > 0) s += `\n[มีรูป ${pr.image_urls.length} รูป]`;
    return s;
  }).join("\n\n") : "";

  const allImageSources = [
    ...kbWithImages.map((i: any) => `"${i.title}"`),
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

  // นับรอบสนทนา = จำนวนข้อความลูกค้าใน history (รวมข้อความปัจจุบัน)
  const customerTurns = history.filter((m: any) => m.sender === "customer").length;

  // ข้อมูล intent ที่มีอยู่แล้ว
  const knownIntent: string[] = [];
  if (freshCustomer.event_type) knownIntent.push(`ประเภทงาน: ${freshCustomer.event_type}`);
  if (freshCustomer.venue) knownIntent.push(`สถานที่: ${freshCustomer.venue}`);
  if (freshCustomer.guest_count) knownIntent.push(`จำนวนคน: ${freshCustomer.guest_count}`);
  if (freshCustomer.event_date) knownIntent.push(`วันจัดงาน: ${freshCustomer.event_date}`);
  const knownIntentStr = knownIntent.length ? `\n\n📋 ข้อมูลลูกค้าที่เก็บไว้แล้ว:\n${knownIntent.join("\n")}` : "";
  const intentCount = knownIntent.length;

  const hasPhone = !!freshCustomer.phone;
  const fmtPhone = hasPhone ? freshCustomer.phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : "";
  const returningPrompt = hasPhone ? `

🔵 ลูกค้ารายนี้เคยให้เบอร์โทรไว้แล้ว: ${fmtPhone}
กฎ:
- ตอบคำถามตามปกติก่อน
- พยายามเก็บข้อมูลเพิ่ม: ประเภทงาน, จำนวนคน, สถานที่/จังหวัด (ทีละเรื่อง)
- ได้ข้อมูล 2+ → ถาม "ให้เจ้าหน้าที่ติดต่อกลับที่เบอร์ ${fmtPhone} เลยได้ไหมครับ?"
- สนทนาครบ 3 รอบยังไม่ได้ข้อมูล → ถามยืนยันเบอร์เลย
- ลูกค้ายืนยัน (ได้/ได้เลย/ค่ะ/ครับ/OK) → set confirm_existing_phone: true` : "";

  const forceAskPhone = !hasPhone && (intentCount >= 2 || customerTurns >= 3);
  const forceAskSection = forceAskPhone ? `\n\n🔴🔴🔴 บังคับ: ตอนนี้ต้องขอเบอร์โทรในข้อความนี้ทันที (ได้ข้อมูล ${intentCount} อย่าง / สนทนา ${customerTurns} รอบ) — ห้ามถามเรื่องอื่นก่อน` : "";

  const prompt = `คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย กระชับ เป็นกันเอง ห้ามเกิน 150 คำ

กฎหลัก:
- ตอบจาก KB เท่านั้น ห้ามแต่งราคา/ตัวเลข
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ลำดับเก็บข้อมูล: ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → ขอเบอร์โทร
- 🔴 กฎเหล็กเบอร์โทร: ได้ข้อมูล 2+ → ขอเบอร์ทันที / สนทนาครบ 3 รอบ → ต้องขอเบอร์
- ทักทาย (สวัสดี/หวัดดี/hi/hello) → ทักทายกลับสั้นๆ แล้ว**ต้องถามกลับเสมอ** เช่น "สนใจสอบถามเรื่องไหนเป็นพิเศษไหมครับ?" หรือ "สนใจจัดงานแบบไหนครับ?" (ห้ามตอบแค่ "สวัสดีครับ" เปล่าๆ)
- ห้ามแสดงเมนูหัวข้อ สนทนาธรรมชาติ
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ

🔤 กฎการใช้คำว่า "ยินดี":
- "ยินดีครับ/ยินดีค่ะ/ยินดีแนะนำ/ยินดีให้บริการ" = ใช้ตอบรับขอบคุณ หรือเสนอช่วยเหลือ ✅
- "ยินดีด้วยครับ/ยินดีด้วยนะครับ" = ใช้แสดงความยินดีในโอกาสพิเศษ (แต่งงาน, ขึ้นบ้านใหม่, รับปริญญา) เท่านั้น ❌ ห้ามใช้ในบริบทอื่น
- เมื่อลูกค้าขอบคุณ ใช้ "ยินดีครับ" หรือ "ยินดีให้บริการครับ" — **ห้ามใช้ "ยินดีด้วย"**

กฎจำนวนคน: ถ้าลูกค้าบอกจำนวนคน ต้องถามว่ารวมพระหรือยัง / เสนอแพ็กเกจต้องอธิบายสัดส่วน (พระ+แขก) / ห้ามเสนอแพ็กเกจที่ guest_pax น้อยกว่าที่ลูกค้าต้องการ

💰 กฎการตอบราคาตาม pricing_tiers:
- ถ้าจำนวนแขกตรงกับ tier ใด → บอกราคา tier นั้น
- ถ้าจำนวนแขกอยู่ระหว่าง tier (เช่น 75 อยู่ระหว่าง 70-80) → **ปัดขึ้น tier ถัดไป** แล้วบอกชัด เช่น "75 ท่านแนะนำเป็นแพ็ก 80 ท่าน 34,000 ค่ะ (เผื่อแขกมาเกิน)"
- ถ้าเกิน tier สูงสุดของแพ็กเกจ → **ห้ามเดาราคา** ตอบ "จำนวนนี้ขอส่งต่อทีมงานช่วยจัดให้นะคะ เดี๋ยวเจ้าหน้าที่ติดต่อกลับค่ะ" แล้วขอเบอร์โทร
- แพ็กเกจที่มีหลายระดับคุณภาพ (เช่น โต๊ะจีน 1/2/3) → เสนอทั้ง 3 ตัวพร้อมจุดต่าง ให้ลูกค้าเลือก ห้ามเลือกให้เอง

📥 สกัด intent: อ่านข้อความลูกค้าแล้วเติมใน intent (ถ้าไม่มี/ไม่ชัด ใส่ null — ห้ามเดา)
- event_type: ประเภทงาน เช่น "งานบุญ", "งานแต่ง", "งานบวช", "งานศพ", "ขึ้นบ้านใหม่"
- venue: สถานที่/จังหวัด เช่น "วัดสระเกศ", "เชียงใหม่", "บ้าน"
- guest_count: จำนวนคน (เลขจำนวนเต็ม) — ถ้าลูกค้าบอก "100 คน" ใส่ 100
- event_date: วันจัด ในรูปแบบ YYYY-MM-DD ถ้าระบุวันที่ชัด หรือคำบรรยายสั้นๆ เช่น "เดือนหน้า", "15 ธค"${returningPrompt}${strictRulesSection}${knownIntentStr}${forceAskSection}

KB:
${kbContext || "(ว่าง)"}
${pkgContext}
${promoContext}
${imageListStr}

สนทนา (ลูกค้าพูดมาแล้ว ${customerTurns} รอบ):
${recentMsgs || "(ใหม่)"}

ลูกค้า: "${messageText}"

ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 3), confirm_existing_phone, intent`;

  let aiResp: any;
  try {
    aiResp = await callAI(prompt, "google/gemini-3-flash-preview");
  } catch (e: any) {
    console.warn(`[LLM] gemini-3-flash failed: ${e.message} — fallback to gemini-2.5-flash`);
    try { aiResp = await callAI(prompt, "google/gemini-2.5-flash"); }
    catch (e2: any) { console.error("AI failed:", e2.message); return; }
  }

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

  const answerText = String(aiResp.answer || "ขออภัย ไม่สามารถตอบได้")
    .replace(/\\n/g, "\n").replace(/\\r/g, "")
    .replace(/\n{3,}/g, "\n\n").trim().slice(0, 5000);
  const imageTitles: string[] = aiResp.image_titles || [];

  // Merge intent ที่ AI สกัดได้ → customers (เฉพาะที่ยังไม่มี)
  const intent = aiResp.intent || {};
  const intentUpdate: any = {};
  if (intent.event_type && !freshCustomer.event_type) intentUpdate.event_type = String(intent.event_type).slice(0, 100);
  if (intent.venue && !freshCustomer.venue) intentUpdate.venue = String(intent.venue).slice(0, 200);
  if (typeof intent.guest_count === "number" && intent.guest_count > 0 && !freshCustomer.guest_count) {
    intentUpdate.guest_count = Math.floor(intent.guest_count);
  }
  if (intent.event_date && !freshCustomer.event_date) {
    const d = String(intent.event_date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) intentUpdate.event_date = d;
  }
  if (Object.keys(intentUpdate).length > 0) {
    await supabase.from("customers").update(intentUpdate).eq("id", customer.id);
    console.log(`[Intent] saved`, intentUpdate);
  }

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
  const kbImgs = kbWithImages.filter((i: any) => imageTitles.includes(i.title));
  const pkgImgs = pkgsWithImages.filter((p: any) => imageTitles.includes(`แพ็กเกจ: ${p.name}`));
  const promoImgs = promosWithImages.filter((pr: any) => imageTitles.includes(`โปรโมชั่น: ${pr.name}`));
  const allImgs = [...kbImgs, ...pkgImgs, ...promoImgs].flatMap((x: any) => getItemImages(x)).slice(0, 3);
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
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else work.catch(e => console.error(e));

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("webhook error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
