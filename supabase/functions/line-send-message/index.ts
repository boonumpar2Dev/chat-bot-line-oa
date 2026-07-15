import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getLineConfig } from "../_shared/line-config.ts";
import { resolveAdminPauseMs } from "../_shared/admin-pause.ts";
import { resolvePhase2Gate } from "../_shared/ai-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const { line_user_id, message, messages, customer_id, quote_token, quoted_message_id } = await req.json();
    if (!line_user_id) return Response.json({ error: "Missing line_user_id" }, { status: 400, headers: corsHeaders });

    const lineMessages = messages || (message ? [{ type: "text", text: message }] : null);
    if (!lineMessages) return Response.json({ error: "Missing message" }, { status: 400, headers: corsHeaders });

    // Fix: LINE auto-link parser บางครั้งกินตัวอักษรท้าย URL เมื่อติดอักษรไทย/non-ASCII ทันที
    // → เติม space 1 ตัวคั่นระหว่าง URL กับตัวอักษรถัดไป (เฉพาะ text message)
    const safeguardUrls = (s: string): string =>
      s.replace(/(https?:\/\/[^\s<>"']+?)(?=[^\s\x21-\x7e])/g, "$1 ");
    for (const m of lineMessages) {
      if (m?.type === "text" && typeof m.text === "string") {
        m.text = safeguardUrls(m.text);
      }
    }

    // แนบ quoteToken กับ message แรกที่เป็น text หรือ sticker (LINE รองรับแค่ 2 types นี้)
    if (quote_token) {
      const idx = lineMessages.findIndex((m: any) => m.type === "text" || m.type === "sticker");
      if (idx >= 0) lineMessages[idx] = { ...lineMessages[idx], quoteToken: quote_token };
    }

    const { channel_access_token } = await getLineConfig();
    const chunks: any[][] = [];
    for (let i = 0; i < lineMessages.length; i += 5) chunks.push(lineMessages.slice(i, i + 5));

    // เก็บ quoteToken + line message id ของแอดมิน — ใช้ทั้ง reply ต่อ และให้ลูกค้า quote-reply ได้
    const sentQuoteTokens: (string | null)[] = [];
    let firstSentMessageId: string | null = null;

    for (let idx = 0; idx < chunks.length; idx++) {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channel_access_token}`,
        },
        body: JSON.stringify({ to: line_user_id, messages: chunks[idx] }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`LINE push error (chunk ${idx + 1}/${chunks.length}):`, err);
        return Response.json({
          error: err,
          partial: idx > 0 ? `ส่งสำเร็จ ${idx * 5} ข้อความก่อนเกิดข้อผิดพลาด` : undefined,
        }, { status: 400, headers: corsHeaders });
      }
      try {
        const body = await res.json();
        if (Array.isArray(body?.sentMessages)) {
          for (const sm of body.sentMessages) {
            sentQuoteTokens.push(sm.quoteToken || null);
            if (!firstSentMessageId && sm.id) firstSentMessageId = sm.id;
          }
        }
      } catch {}
    }

    // Save admin message + start manual chat timer
    if (customer_id) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const text = lineMessages.map((m: any) => {
        if (m.type === "text") return m.text || "";
        if (m.type === "image") return `[รูปภาพ]\n📎 ${m.originalContentUrl || m.previewImageUrl || ""}`;
        if (m.type === "video") return `[วิดีโอ]\n📎 ${m.originalContentUrl || ""}`;
        if (m.type === "file") return `[ไฟล์]\n📎 ${m.originalContentUrl || ""}`;
        if (m.type === "sticker") return `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${m.stickerId}/android/sticker.png`;
        if (m.type === "flex" || m.type === "template") {
          const alt = (m.altText || "").trim();
          // ดึง URL จากปุ่ม action (เช่น flex file มีปุ่มดาวน์โหลด) เพื่อให้หน้าแชท render ปุ่มดาวน์โหลดได้
          let extractedUrl = "";
          try {
            const stack: any[] = [m.contents];
            while (stack.length) {
              const node = stack.pop();
              if (!node || typeof node !== "object") continue;
              if (node.action?.type === "uri" && typeof node.action.uri === "string") {
                extractedUrl = node.action.uri; break;
              }
              if (Array.isArray(node.contents)) stack.push(...node.contents);
              if (node.body) stack.push(node.body);
              if (node.hero) stack.push(node.hero);
              if (node.footer) stack.push(node.footer);
            }
          } catch {}
          const label = alt || `[${m.type}]`;
          return extractedUrl ? `${label}\n📎 ${extractedUrl}` : label;
        }
        return `[${m.type}]`;
      }).join("\n");
      const { data: cfgArr } = await admin.from("app_settings").select("manual_chat_hours, ai_policy_config").eq("key", "ai_config").limit(1);
      const pauseSettings = cfgArr?.[0] || null;
      const pause = resolveAdminPauseMs(customer_id, pauseSettings, new Date());
      const until = new Date(Date.now() + pause.ms).toISOString();
      console.log(`[admin-pause] customer=${customer_id} mode=${pause.mode} minutes=${pause.minutes}`);

      // ใช้ quoteToken แรกที่ได้กลับมา (สำหรับ reply ต่อ admin message นี้ในอนาคต)
      const firstQuoteToken = sentQuoteTokens.find((t) => !!t) || null;

      await admin.from("conversations").insert({
        customer_id,
        message: text,
        sender: "admin",
        admin_user_id: user.id,
        quote_token: firstQuoteToken,
        quoted_message_id: quoted_message_id || null,
        line_message_id: firstSentMessageId,
      });

      // ตรวจสถานะลูกค้า: สำหรับ pending_confirm/confirmed/confirmed_returning
      // → ไม่ปิด ai_active ยาว แต่ยัง set manual_chat_until สั้น ๆ (3 นาที fallback)
      //   เพื่อกัน AI ตอบทับแอดมินทันทีหลังแอดมินเพิ่งพิมพ์
      const { data: custRow } = await admin.from("customers").select("status").eq("id", customer_id).maybeSingle();
      // Payment 2.9.1 (ext): include `completed` so admin replies to a
      // post-event balance-slip handoff enter the short-pause window too.
      const isPostQuoteStatus = custRow?.status === "pending_confirm" || custRow?.status === "confirmed" || custRow?.status === "confirmed_returning" || custRow?.status === "completed";

      const custPatch: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_snippet: `👤 ${text.slice(0, 120)}`,
        unread_count: 0,
        admin_seen_at: new Date().toISOString(),
      };
      if (isPostQuoteStatus) {
        // Short pause: ใช้ live_admin_pause_minutes ถ้ามี ไม่งั้น fallback 3 นาที
        const rawMin = (pauseSettings?.ai_policy_config as any)?.live_admin_pause_minutes;
        const shortMin = typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 3;
        const shortUntil = new Date(Date.now() + shortMin * 60_000).toISOString();
        custPatch.manual_chat_until = shortUntil;
        // ai_active คงไว้เดิม (ไม่ปิดยาว)
        console.log(`[AdminPause] customer=${customer_id} status=${custRow?.status} set manual_chat_until ${shortMin}m (source=${typeof rawMin === "number" && rawMin > 0 ? "config" : "fallback"})`);
      } else {
        custPatch.ai_active = false;
        custPatch.manual_chat_until = until;
        console.log(`[AdminPause] customer=${customer_id} status=${custRow?.status ?? "unknown"} legacy pause mode=${pause.mode} minutes=${pause.minutes}`);
      }
      await admin.from("customers").update(custPatch).eq("id", customer_id);


      // Fire-and-forget: ถ้าลูกค้ายังไม่มีเบอร์ ให้ AI ลอง extract จากบทสนทนา (ไม่ block admin)
      try {
        const { data: cust } = await admin.from("customers").select("phone").eq("id", customer_id).maybeSingle();
        if (!cust?.phone) {
          const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-phone-from-chat`;
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ customer_id }),
          }).catch((e) => console.error("extract-phone trigger failed:", e?.message || e));
        }
      } catch (e) {
        console.error("extract-phone pre-check failed:", e);
      }

    }


    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
