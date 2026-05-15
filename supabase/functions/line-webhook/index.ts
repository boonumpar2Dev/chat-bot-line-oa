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
function getItemVideos(item: any): { url: string; thumb_url: string }[] {
  return Array.isArray(item.video_urls) ? item.video_urls.filter((v: any) => v?.url && v?.thumb_url) : [];
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

async function ocrImage(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "อ่านข้อความทั้งหมดในรูปนี้ออกมาเป็น plain text\n- ถ้าเป็นแคปแชท: แยก 'ผู้พูด: ข้อความ' ตามลำดับ\n- ถ้าเป็นใบเสนอราคา/เมนู/ตาราง: สรุปรายการ + ราคา\n- ถ้าไม่มีข้อความที่อ่านได้: บรรยายสั้นๆ ว่ารูปคืออะไร (ไม่เกิน 1 ประโยค)\nตอบสั้นกระชับไม่เกิน 500 ตัวอักษร ไม่ต้องมีคำนำ" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
      }),
    });
    if (!res.ok) { console.error(`[OCR] gateway ${res.status}`); return null; }
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return text.length > 0 ? text.slice(0, 800) : null;
  } catch (e) {
    console.error("[OCR] failed", e);
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
    // 📄 OCR: อ่านข้อความในรูป (เช่น แคปแชทจากที่อื่น) แล้วใส่เป็น context ให้ AI ตอบต่อได้
    if (msgType === "image" && fileUrl) {
      const ocr = await ocrImage(fileUrl);
      if (ocr) {
        messageText = `[${label}]\n📎 ${fileUrl}\n📄 เนื้อหาในรูป:\n${ocr}`;
        isText = true;
      }
    }
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

  // 🕐 Debounce: รอให้ลูกค้าพิมพ์เสร็จก่อนตอบ (กันพิมพ์หลายบรรทัดติดกัน)
  // อ่านค่า debounce_seconds จาก app_settings (ตั้งค่าได้จากหน้า Settings)
  if (lineMsgId) {
    const { data: dbCfgArr } = await supabase.from("app_settings").select("debounce_seconds").eq("key", "ai_config").limit(1);
    const debounceSec = Math.max(0, Number(dbCfgArr?.[0]?.debounce_seconds ?? 15));
    if (debounceSec > 0) {
      await new Promise(r => setTimeout(r, debounceSec * 1000));
      const { data: latestArr } = await supabase
        .from("conversations")
        .select("line_message_id")
        .eq("customer_id", customer.id)
        .eq("sender", "customer")
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = latestArr?.[0];
      if (latest && latest.line_message_id && latest.line_message_id !== lineMsgId) {
        console.log(`[Debounce ${debounceSec}s] skip ${lineMsgId} — newer customer message arrived`);
        return;
      }
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

  // เช็ค context: AI เพิ่งถาม Tag/Tax ID มาหรือเปล่า → ถ้าใช่ → treat reply ที่เป็นเลขเป็น Tax ID context
  const { data: lastAiArr } = await supabase
    .from("conversations")
    .select("message")
    .eq("customer_id", customer.id)
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastAiMsg = lastAiArr?.[0]?.message || "";
  const aiAskedTax = /(tag\s*id|เลขผู้เสีย|เลขประจำตัวผู้เสียภาษี|นิติบุคคล|tax\s*id)/i.test(lastAiMsg);

  // Tax ID detection (เลขประจำตัวผู้เสียภาษี 13 หลัก / มี keyword / หรือ AI เพิ่งถามมา)
  const allDigitRuns = (messageText.match(/\d+/g) || []);
  const taxKeyword = /(tag|แท็ก|tax|ภาษี|เลขผู้เสีย|นิติบุคคล|จดทะเบียน)/i.test(messageText);
  let taxId: string | null = null;
  let taxIdMaybe: string | null = null; // เลขที่น่าจะเป็น tax แต่ไม่ครบ 13 หลัก (ตอน AI ถามมา)
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
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      tax_id: taxId, ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    await sendAndSave(supabase, customer.id, lineUserId,
      `รับทราบค่ะ ได้รับข้อมูลเลขผู้เสียภาษี/Tag ${taxId} เรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับเร็วที่สุดนะคะ 🙏`);
    return;
  }
  // AI เพิ่งถาม Tax ID + ลูกค้าตอบเลขมา แต่ไม่ครบ 13 หลัก → ขอใหม่ (ห้ามไปเข้า phone validation)
  if (taxIdMaybe) {
    await sendAndSave(supabase, customer.id, lineUserId,
      `เลข "${taxIdMaybe}" ดูไม่ครบ 13 หลักนะคะ Tax ID ของบริษัทจะมี 13 หลักพอดีค่ะ รบกวนทวนใหม่อีกครั้งนะคะ 🙏`);
    return;
  }

  // Phone detection — collect ALL candidates (ข้าม run ที่ยาว 13 หลักเพื่อกัน Tax ID)
  const pureDigits = messageText.replace(/[\s\-().+]/g, "");
  const isPure = /^\d+$/.test(pureDigits);
  const phoneSeqs = messageText.match(/\d[\d\s\-().]{6,25}\d/g) || [];

  const candidates: string[] = [];
  if (isPure && pureDigits.length >= 7 && pureDigits.length <= 12) {
    candidates.push(pureDigits);
  } else {
    for (const s of phoneSeqs) {
      const d = s.replace(/[^0-9]/g, "");
      if (d.length >= 7 && d.length <= 12) candidates.push(d);
    }
  }
  // Normalize +66/66 → 0
  const normalized = candidates.map(p => /^66\d{8,9}$/.test(p) ? "0" + p.slice(2) : p);

  // เบอร์ไทย valid:
  //   มือถือ 10 หลัก ขึ้นต้น 06/08/09  |  เบอร์บ้าน 9 หลัก ขึ้นต้น 02-07
  const isValidThaiPhone = (p: string) => /^0[689]\d{8}$/.test(p) || /^0[2-7]\d{7}$/.test(p);
  const validPhones = Array.from(new Set(normalized.filter(isValidThaiPhone)));

  // Invalid phone-like: ถามใหม่ ก็ต่อเมื่อข้อความสั้นและดูเหมือนตั้งใจให้เบอร์
  const nonDigit = messageText.replace(/[0-9\s\-().+]/g, "").trim();
  const looksLikePhoneIntent = nonDigit.length <= 40;
  const invalidPhones = (validPhones.length === 0 && looksLikePhoneIntent)
    ? normalized.filter(p => !isValidThaiPhone(p) && /^0?\d{7,10}$/.test(p))
    : [];
  

  if (validPhones.length > 0) {
    const fmtOne = (p: string) => /^0[689]\d{8}$/.test(p)
      ? p.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
      : p.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
    // Save ALL valid phones (comma-separated). Merge with existing if any.
    const existingPhones = (freshCustomer.phone || "").split(/[,\s]+/).filter(isValidThaiPhone);
    const allPhones = Array.from(new Set([...existingPhones, ...validPhones]));
    const phoneStr = allPhones.join(", ");
    const phoneMuteHours = cfg.phone_mute_hours ?? 1;
    const muteUntil = new Date(Date.now() + phoneMuteHours * 3600000).toISOString();
    await supabase.from("customers").update({
      phone: phoneStr, ai_active: false, manual_chat_until: muteUntil, status: "pending_quote",
    }).eq("id", customer.id);
    const fmtList = validPhones.map(fmtOne);
    const fmtStr = fmtList.length === 1 ? fmtList[0] : fmtList.join(", ");
    const lines = [
      validPhones.length === 1
        ? `ขอบคุณสำหรับข้อมูลค่ะ บันทึกเบอร์โทร ${fmtStr} เรียบร้อยแล้ว`
        : `ขอบคุณสำหรับข้อมูลค่ะ บันทึกเบอร์โทรทั้ง ${validPhones.length} เบอร์เรียบร้อยแล้ว: ${fmtStr}`,
      "",
      "จะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยนะคะ",
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
    const text = `ขอเบอร์อีกครั้งได้ไหมคะ เบอร์ที่ให้มา "${bad}" ดูไม่ตรงรูปแบบเบอร์ไทยค่ะ 🙏\n\n• มือถือ 10 หลัก ขึ้นต้น 06/08/09 (เช่น 081-234-5678)\n• เบอร์บ้าน 9 หลัก ขึ้นต้น 02-07 (เช่น 02-123-4567)`;
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
  // status เป็นแค่ป้าย funnel — ai_active เป็น single source of truth (เช็คไปแล้วบรรทัด 391)
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
  const kbWithVideos = kbItems.filter((i: any) => getItemVideos(i).length > 0);
  const kbContext = kbItems.map((k: any) => {
    const imgs = getItemImages(k);
    const vids = getItemVideos(k);
    const content = (k.content || "").slice(0, 800);
    const cat = k.category ? `[${k.category}] ` : "";
    const tags: string[] = [];
    if (imgs.length) tags.push(`มีรูป ${imgs.length} รูป`);
    if (vids.length) tags.push(`มีวิดีโอ ${vids.length} คลิป`);
    return `## ${cat}${k.title}\n${content}${tags.length ? `\n[${tags.join(" + ")}]` : ""}`;
  }).join("\n\n");

  // Package context (with custom_attributes + tier.guest_count fallback)
  const pkgsWithImages = (pkgs || []).filter((p: any) => p.image_urls?.length > 0);
  const pkgsWithVideos = (pkgs || []).filter((p: any) => getItemVideos(p).length > 0);
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
    if (p.notes) s += `\nหมายเหตุ: ${(p.notes || "").slice(0, 200)}`;
    if (p.ai_instruction) s += `\n🤖 คำสั่ง AI: ${p.ai_instruction}`;
    if (p.image_urls?.length > 0) s += `\n[รูปรวมแพ็ก ${p.image_urls.length} รูป]`;
    const pVids = getItemVideos(p);
    if (pVids.length > 0) s += `\n[วิดีโอ ${pVids.length} คลิป]`;
    return s;
  }).join("\n\n") : "";

  const promosWithImages = (promos || []).filter((pr: any) => pr.image_urls?.length > 0);
  const promosWithVideos = (promos || []).filter((pr: any) => getItemVideos(pr).length > 0);
  const promoContext = (promos || []).length > 0 ? "\n\n--- โปรโมชั่น ---\n" + (promos || []).map((pr: any) => {
    let s = `## โปรโมชั่น: ${pr.name}`;
    if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(", ")}`;
    if (pr.min_guests != null) s += `\nเงื่อนไข: ใช้กับงานตั้งแต่ ${pr.min_guests} ท่านขึ้นไป`;
    if (pr.description) s += `\n${pr.description}`;
    if (pr.image_urls?.length > 0) s += `\n[มีรูป ${pr.image_urls.length} รูป]`;
    const prVids = getItemVideos(pr);
    if (prVids.length > 0) s += `\n[วิดีโอ ${prVids.length} คลิป]`;
    return s;
  }).join("\n\n") + `\n\n⚠️ กฎเสนอโปรโมชั่น:
1. ก่อนเสนอโปร เช็คจำนวนแขกของลูกค้า เทียบกับเงื่อนไขขั้นต่ำของโปรนั้นเสมอ
2. ถ้าลูกค้ายังไม่บอกจำนวนแขก → เสนอได้แต่ต้องบอกเงื่อนไขควบคู่ (เช่น "โปร X สำหรับงาน 50 ท่านขึ้นไป")
3. ถ้าลูกค้าจำนวนน้อยกว่าเงื่อนไข → ห้ามเสนอโปรนั้นเด็ดขาด (เสนอตัวอื่นที่เข้าเกณฑ์ หรือไม่เสนอเลย)
4. เสนอโปรต้องบอกชื่อโปรเต็มทุกครั้ง ห้ามพูดลอยๆ ว่า "มีโปรนะคะ"` : "";

  // Tier-level images: title format "แพ็กเกจ: <name> — <tier_name>"
  const tierImageRefs: { title: string; url: string }[] = [];
  for (const p of (pkgs || [])) {
    for (const t of (p.pricing_tiers || [])) {
      if (t.image_url && t.tier_name) {
        tierImageRefs.push({ title: `แพ็กเกจ: ${p.name} — ${t.tier_name}`, url: t.image_url });
      }
    }
  }

  const allImageSources = [
    ...kbWithImages.map((i: any) => `"${i.title}"`),
    ...pkgsWithImages.map((p: any) => `"แพ็กเกจ: ${p.name}" (รูปรวม/เปรียบเทียบ)`),
    ...tierImageRefs.map((t) => `"${t.title}" (รูปเฉพาะ tier)`),
    ...promosWithImages.map((pr: any) => `"โปรโมชั่น: ${pr.name}"`),
    ...kbWithVideos.map((i: any) => `"VDO: ${i.title}"`),
    ...pkgsWithVideos.map((p: any) => `"VDO แพ็กเกจ: ${p.name}"`),
    ...promosWithVideos.map((pr: any) => `"VDO โปรโมชั่น: ${pr.name}"`),
  ];
  const imageListStr = allImageSources.length ? `\n\n📸 รายชื่อรูป/วิดีโอที่ส่งได้ (ใส่ใน image_titles ตรงตามนี้):\n${allImageSources.join("\n")}\n\n💡 กฎเลือกสื่อ (สำคัญมาก — ทำผิดบ่อย):\n\n🎯 จับเจตนาลูกค้าก่อนเลือกรูป:\nA) ขอ "แพ็กเกจ"/"ราคา"/"ใบเสนอราคา" หรือบอก "ประเภทงาน+จำนวนคน" (เช่น ขึ้นบ้านใหม่ พระ5 แขก20) → **ส่งเฉพาะ "แพ็กเกจ: X" ที่เข้าเงื่อนไข** ห้ามแถม "เมนู..." หรือ "ตัวอย่าง..." เด็ดขาด\nB) ขอ "เมนูแนะนำ" → ส่งเฉพาะ "เซ็ตเมนูแนะนำสำหรับลูกค้าบุญ+บุฟเฟ่ต์" ตัวเดียว ห้ามแถม "เมนูบุญ+ซุ้ม/โต๊ะจีน/บุฟเฟ่ต์" หรือเมนูขนมหวาน\nC) ขอ "เมนู" เฉยๆ ไม่ระบุประเภท → ถามก่อนว่าสนใจประเภทไหน (บุฟเฟ่ต์/ซุ้ม/โต๊ะจีน) ห้ามส่งรูปเมนูทุกแบบรวมกัน\nD) ขอ "เมนูทุกแบบ/ทั้งหมด/ครบ" → ส่ง "เมนูบุญ+บุฟเฟ่ต์" + "เมนูบุญ+ซุ้มอาหาร" + "เมนูบุญ+โต๊ะจีน" (3 อัน) ห้ามตัดเหลืออันเดียว\nE) ขอ "ตัวอย่างจัดงาน" + ระบุ "บ้านและบริษัท"/"ทั้งสองแบบ" → ส่งทั้ง "ตัวอย่างรูปแบบการจัดพิธีสงฆ์ แบบ บ้านหรือครบรอบ" + "...แบบ บริษัท/ออฟฟิศ" ห้ามส่งแค่อันเดียว\nF) ขอ "ตัวอย่างซุ้มอาหาร" → ส่ง "ตัวอย่างหน้าตาซุ้มอาหาร" เท่านั้น\n\n📐 กติกาเพิ่มเติม:\n- ลูกค้าระบุจำนวนคน/ระดับชัดเจน → ส่ง "รูปเฉพาะ tier" ของ tier นั้น (แทน "รูปรวม")\n- ลูกค้าขอเปรียบเทียบหลายระดับ → ส่ง "รูปรวม" ของแพ็ก\n- วิดีโอ (ขึ้นต้น "VDO:") → ส่งเฉพาะเมื่อลูกค้าขอดูบรรยากาศ/อยากเห็นการจัดจริง\n- image_titles **ใส่ได้สูงสุด 4 รายการ** ระบบจะดึงรูปของแต่ละ title มาเอง (1 KB อาจมีหลายรูป ระบบจัดการให้)\n- ห้ามใส่ title ที่ลูกค้าไม่ได้ขอ — ผิดบ่อยมาก ตรวจ image_titles ทุกอันว่าตรงเจตนาข้อ A-F หรือไม่` : "";


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

  // หมายเหตุ: กฎเรื่องการขอเบอร์/ตอบสั้น/ไม่ถามซ้ำ ย้ายไป strict_rules (Settings UI) ทั้งหมด
  // เพื่อให้แอดมินแก้ไขได้เองโดยไม่ต้องแก้โค้ด

  const prompt = `คุณคือ AI ผู้ช่วยธุรกิจจัดเลี้ยง ตอบภาษาไทย เป็นกันเอง ใช้ "ค่ะ/นะคะ" ลงท้ายเบาๆ

🔴 กฎทองห้ามผิดเด็ดขาด:
1. คำขึ้นต้น **ห้ามใช้ "ยินดีด้วยค่ะ/ครับ"** ("ยินดีด้วย" = แสดงความยินดีในโอกาสพิเศษเท่านั้น) ใช้ "ยินดีค่ะ", "รับทราบค่ะ", "ได้เลยค่ะ", "สวัสดีค่ะ" แทน
2. ใช้ **"ค่ะ/คะ"** เท่านั้น ห้ามสลับ "ครับ" เด็ดขาด
3. **ห้ามถามข้อมูลซ้ำ** ที่ลูกค้าเคยให้แล้ว (ดู "ข้อมูลลูกค้าที่เก็บไว้แล้ว")
4. กรณีจำนวนแขกเป็นเศษ → เสนอ **แค่ทางเดียว** ต่อรอบ (ค่าเริ่มต้น: tier สูงกว่า / "tier ต่ำกว่า + เพิ่มต่อหัว" เฉพาะเมื่อลูกค้าขอประหยัด) ห้ามยัด 2 ทาง ห้ามแต่งราคาต่อหัว

🚫 ANTI-HALLUCINATION:
- ตอบจาก KB เท่านั้น ห้ามแต่ง ห้ามเดา
- รูปแบบอาหาร = **บุฟเฟ่ต์, ซุ้มอาหาร, โต๊ะจีน เท่านั้น** ❌ ห้ามพูด "ค็อกเทล/คอฟฟี่เบรก/fine dining"
- ห้ามแต่งชื่อเมนู/แพ็กเกจ/บริการ ไม่แน่ใจ → "ขอส่งต่อทีมงานนะคะ"

กฎหลัก:
- ตอบคำถามก่อน แล้วค่อยถามข้อมูลเพิ่ม (ทีละเรื่อง)
- ลำดับเก็บข้อมูล: ประเภทงาน → สถานที่ → จำนวนคน → วันจัด → ขอเบอร์โทร (ข้ามข้อที่ลูกค้าให้แล้ว)
- ทักทาย → ทักทายกลับสั้นๆ + ถามกลับ "สนใจสอบถามเรื่องไหนเป็นพิเศษไหมคะ?"
- ไม่มีใน KB → บอกให้เจ้าหน้าที่ติดต่อกลับ
- 🚫 ห้ามเสนอแพ็กเกจที่ไม่ตรงเงื่อนไขขั้นต่ำ (min_condition)
- 📸 ทุกครั้งที่แนะนำแพ็กเกจ ใส่ "แพ็กเกจ: <ชื่อ>" ลง image_titles
- ⚠️ รูป tier (มี " — "): ส่งเฉพาะเมื่อ tier ตรงกับจำนวนท่านที่ลูกค้าระบุเท่านั้น
- 📄 ถ้าข้อความมี "📄 เนื้อหาในรูป:" = ลูกค้าส่งแคปแชท/ใบเสนอราคามา ให้อ่านเหมือนลูกค้าพิมพ์เอง

กฎจำนวนคน: บอกจำนวน → ถามรวมพระหรือยัง / เสนอแพ็กต้องอธิบายสัดส่วน (พระ+แขก) / ห้ามเสนอแพ็กที่ guest_pax น้อยกว่าที่ต้องการ

💰 กฎราคาตาม pricing_tiers:
- จำนวนตรง tier → บอกราคา tier นั้น
- อยู่ระหว่าง tier → ปัดขึ้น tier ถัดไป บอกชัด เช่น "75 ท่านแนะนำเป็นแพ็ก 80 ท่าน 34,000 ค่ะ"
- เกิน tier สูงสุด → ห้ามเดา ตอบ "ขอส่งต่อทีมงานนะคะ"
- หลายระดับคุณภาพ (โต๊ะจีน 1/2/3) → เสนอครบพร้อมจุดต่าง ห้ามเลือกให้เอง
- ตัวเลือกพิเศษใน notes/ai_instruction → เสนอเมื่อตรงเงื่อนไข

📥 สกัด intent (ห้ามเดา ใส่ null ถ้าไม่ชัด):
- event_type, venue, guest_count (เลขจำนวนเต็ม), event_date (YYYY-MM-DD)${returningPrompt}${strictRulesSection}${knownIntentStr}

KB:
${kbContext || "(ว่าง)"}
${pkgContext}
${promoContext}
${imageListStr}

สนทนา (ลูกค้าพูดมาแล้ว ${customerTurns} รอบ):
${recentMsgs || "(ใหม่)"}

ลูกค้า: "${messageText}"

⚠️ ก่อนตอบ ตรวจ 6 ข้อ:
(1) ขึ้นต้นด้วย "ยินดีด้วย"? → เปลี่ยนเป็น "ยินดีค่ะ/รับทราบค่ะ"
(2) มี "ครับ" ปน? → เปลี่ยนเป็น "ค่ะ/คะ"
(3) ถามเรื่องที่อยู่ใน "ข้อมูลลูกค้าที่เก็บไว้แล้ว"? → ลบทิ้ง ไปถามข้ออื่น
(4) เสนอ 2 ทางเลือก (tier สูงกว่า + เพิ่มต่อหัว) ในข้อความเดียว? → เก็บแค่ทางเดียว
(5) มี "ค็อกเทล/คอฟฟี่เบรก/fine dining" หรืออาหารที่ไม่ใช่บุฟเฟ่ต์/ซุ้ม/โต๊ะจีน? → ลบทิ้ง
(6) ลูกค้าขอ "เมนูแนะนำ" / "ขอแพ็กเกจ" / "ตัวอย่างจัดงาน" / "เมนูทุกแบบ"? → ต้องใส่ image_titles ให้ตรง (ห้ามปล่อยว่าง แม้จะถามต่อ)
(7) คำถามที่จะถามนี้ AI เคยถามใน 1 รอบล่าสุดแล้วลูกค้าไม่ตอบ? → **ห้ามถามซ้ำ** เปลี่ยนไปตอบ/ถามเรื่องอื่นแทน (รออีก 2-3 รอบค่อยถามใหม่)

ตอบ JSON: answer, confidence (0-100), image_titles (สูงสุด 4 — ตรงตามกฎ A-F), confirm_existing_phone, intent`;

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

  // Media dedup (KB + package-level + tier-level + promo + videos) — keep order from image_titles
  type Media = { type: "image" | "video"; url: string; thumb?: string };
  const mediaList: Media[] = [];

  // Fuzzy match for AI hallucinated titles
  function fuzzyKB(needle: string) {
    const n = needle.toLowerCase().trim();
    return kbWithImages.find((x: any) =>
      x.title.toLowerCase() === n || x.title.toLowerCase().includes(n) || n.includes(x.title.toLowerCase())
    );
  }
  function fuzzyPkg(needle: string) {
    const n = needle.toLowerCase().trim();
    return pkgsWithImages.find((x: any) =>
      x.name.toLowerCase() === n || x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase())
    );
  }

  for (const title of imageTitles) {
    if (title.startsWith("VDO โปรโมชั่น: ")) {
      const name = title.replace("VDO โปรโมชั่น: ", "");
      const pr = promosWithVideos.find((x: any) => x.name === name);
      if (pr) for (const v of getItemVideos(pr)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("VDO แพ็กเกจ: ")) {
      const name = title.replace("VDO แพ็กเกจ: ", "");
      const p = pkgsWithVideos.find((x: any) => x.name === name);
      if (p) for (const v of getItemVideos(p)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("VDO: ")) {
      const t = title.replace("VDO: ", "");
      const k = kbWithVideos.find((x: any) => x.title === t);
      if (k) for (const v of getItemVideos(k)) mediaList.push({ type: "video", url: v.url, thumb: v.thumb_url });
    } else if (title.startsWith("แพ็กเกจ: ") && title.includes(" — ")) {
      const t = tierImageRefs.find((x) => x.title === title);
      if (t) mediaList.push({ type: "image", url: t.url });
    } else if (title.startsWith("แพ็กเกจ: ")) {
      const name = title.replace("แพ็กเกจ: ", "");
      let p = pkgsWithImages.find((x: any) => x.name === name);
      if (!p) p = fuzzyPkg(name); // fuzzy fallback
      if (p) for (const u of getItemImages(p)) mediaList.push({ type: "image", url: u });
    } else if (title.startsWith("โปรโมชั่น: ")) {
      const name = title.replace("โปรโมชั่น: ", "");
      const pr = promosWithImages.find((x: any) => x.name === name);
      if (pr) for (const u of getItemImages(pr)) mediaList.push({ type: "image", url: u });
    } else {
      let k = kbWithImages.find((x: any) => x.title === title);
      if (!k) k = fuzzyKB(title); // fuzzy fallback
      if (k) for (const u of getItemImages(k)) mediaList.push({ type: "image", url: u });
    }
  }
  const allMedia = mediaList.slice(0, 4); // LINE: text + 4 media = 5 messages (max 5)
  const lastSent = Array.isArray(customer.last_sent_image_titles) ? customer.last_sent_image_titles : [];
  const sameTitles = [...imageTitles].sort().join("|") === [...lastSent].sort().join("|") && imageTitles.length > 0;
  const mediaToSend = sameTitles ? [] : allMedia;

  const bubbles = answerText.split(/\n*---+\n*/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  const textBubbles = bubbles.length > 0 ? bubbles : [answerText];
  const lineMessages: any[] = textBubbles.map(t => ({ type: "text", text: t }));
  const mediaSlots = Math.max(0, 5 - lineMessages.length);
  for (const m of mediaToSend.slice(0, mediaSlots)) {
    if (m.type === "video") {
      lineMessages.push({ type: "video", originalContentUrl: m.url, previewImageUrl: m.thumb || m.url });
    } else {
      lineMessages.push({ type: "image", originalContentUrl: m.url, previewImageUrl: m.url });
    }
  }
  await pushLine(lineUserId, lineMessages);

  const savedMsg = mediaToSend.length > 0
    ? `${answerText}\n${mediaToSend.map(m => `${m.type === "video" ? "🎬" : "📎"} ${m.url}`).join("\n")}`
    : answerText;
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
