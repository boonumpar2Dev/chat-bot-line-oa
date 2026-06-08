// Broadcast send — query targets → push LINE messages → log per-recipient
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getLineConfig } from "../_shared/line-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_DELAY_MS = 120;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function bubbleToText(m: any): string {
  if (!m || typeof m !== "object") return "";
  if (m.type === "text") return m.text || "";
  if (m.type === "image") return `[รูปภาพ]\n📎 ${m.originalContentUrl || m.previewImageUrl || ""}`;
  if (m.type === "video") return `[วิดีโอ]\n📎 ${m.originalContentUrl || ""}`;
  if (m.type === "flex" || m.type === "template") {
    const alt = (m.altText || "").trim();
    return alt || `[${m.type}]`;
  }
  return `[${m.type}]`;
}

// Build LINE action object from our ActionItem
function buildAction(a: any) {
  if (!a) return null;
  const label = String(a.label || "ปุ่ม").slice(0, 20);
  if (a.type === "uri" && a.uri) {
    return { type: "uri", label, uri: String(a.uri) };
  }
  if (a.type === "message" && a.text) {
    return { type: "message", label, text: String(a.text).slice(0, 300) };
  }
  return null;
}

// Build button components array
function buildButtons(actions: any[]): any[] {
  return (actions || [])
    .map(buildAction)
    .filter(Boolean)
    .map((action: any) => ({
      type: "button",
      style: "primary",
      height: "sm",
      action,
    }));
}

// Default placeholder for video preview when none provided
const VIDEO_PLACEHOLDER_URL = "https://void-blossom-bud.lovable.app/video-placeholder.jpg";

// Build Rich Message Flex bubble (full-bleed image + optional tap action; used when 2+ buttons OR single tap)
function buildRichMessageBubble(b: any, opts: { tapAction?: any } = {}) {
  const buttons = buildButtons(b.actions);
  const bubble: any = {
    type: "bubble",
    size: "giga",
    hero: b.image_url ? {
      type: "image",
      url: String(b.image_url),
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "cover",
      ...(opts.tapAction ? { action: opts.tapAction } : {}),
    } : undefined,
  };
  if (buttons.length >= 2) {
    bubble.footer = { type: "box", layout: "vertical", spacing: "sm", contents: buttons };
  }
  return bubble;
}

// Buttons-only bubble (attached after native video message)
function buildButtonsOnlyBubble(actions: any[], altLabel?: string) {
  const buttons = buildButtons(actions);
  if (!buttons.length) return null;
  const contents: any[] = [];
  if (altLabel) contents.push({ type: "text", text: String(altLabel).slice(0, 60), size: "sm", color: "#666666", wrap: true });
  contents.push({ type: "box", layout: "vertical", spacing: "sm", contents: buttons, margin: altLabel ? "md" : "none" });
  return {
    type: "bubble",
    size: "kilo",
    body: { type: "box", layout: "vertical", contents },
  };
}

// Card bubble (image + title + desc + buttons) — used inside carousel
function buildCardBubble(c: any) {
  const buttons = buildButtons(c.actions);
  const bodyContents: any[] = [];
  if (c.title) bodyContents.push({ type: "text", text: String(c.title).slice(0, 40), weight: "bold", size: "md", wrap: true });
  if (c.description) bodyContents.push({ type: "text", text: String(c.description).slice(0, 60), size: "sm", color: "#666666", wrap: true, margin: "sm" });
  return {
    type: "bubble",
    size: "kilo",
    hero: c.image_url ? {
      type: "image",
      url: String(c.image_url),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    } : undefined,
    body: bodyContents.length ? { type: "box", layout: "vertical", contents: bodyContents } : undefined,
    footer: buttons.length ? {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: buttons,
    } : undefined,
  };
}

// Normalize editor bubbles → LINE Messaging API format
function normalizeMessages(input: any[]): any[] {
  const out: any[] = [];
  for (const b of (input || [])) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && b.text) {
      out.push({ type: "text", text: String(b.text).slice(0, 5000) });
    } else if (b.type === "image" && b.url) {
      out.push({
        type: "image",
        originalContentUrl: b.url,
        previewImageUrl: b.preview_url || b.url,
      });
    } else if (b.type === "video" && b.url) {
      out.push({
        type: "video",
        originalContentUrl: b.url,
        previewImageUrl: b.thumb_url || b.preview_url || b.url,
      });
    } else if (b.type === "flex" && b.contents) {
      out.push({
        type: "flex",
        altText: b.alt_text || "ข้อความจาก LINE OA",
        contents: b.contents,
      });
    } else if (b.type === "rich_message" && b.image_url) {
      out.push({
        type: "flex",
        altText: String(b.alt_text || "Rich Message").slice(0, 400),
        contents: buildRichMessageBubble(b),
      });
    } else if (b.type === "rich_video" && b.video_url && b.preview_url) {
      out.push({
        type: "flex",
        altText: String(b.alt_text || "Rich Video").slice(0, 400),
        contents: buildRichVideoBubble(b),
      });
    } else if (b.type === "card_message" && Array.isArray(b.cards) && b.cards.length) {
      const validCards = b.cards.filter((c: any) => c && c.image_url).slice(0, 12);
      if (!validCards.length) continue;
      if (validCards.length === 1) {
        out.push({
          type: "flex",
          altText: String(b.alt_text || "Card").slice(0, 400),
          contents: buildCardBubble(validCards[0]),
        });
      } else {
        out.push({
          type: "flex",
          altText: String(b.alt_text || "Card Message").slice(0, 400),
          contents: {
            type: "carousel",
            contents: validCards.map(buildCardBubble),
          },
        });
      }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { channel_access_token } = await getLineConfig();

    // ============ TEST SEND MODE ============
    // body: { test: true, test_user_ids: string[], messages: Bubble[] }
    if (body.test === true) {
      const testIds: string[] = Array.isArray(body.test_user_ids) ? body.test_user_ids.filter((x: any) => typeof x === "string" && x.trim()) : [];
      const testMsgs = normalizeMessages(body.messages || []);
      if (testIds.length === 0) return Response.json({ error: "ต้องใส่ LINE User ID อย่างน้อย 1" }, { status: 400, headers: corsHeaders });
      if (testMsgs.length === 0) return Response.json({ error: "ไม่มีข้อความที่จะส่ง" }, { status: 400, headers: corsHeaders });

      let success = 0, failed = 0;
      const errors: { id: string; error: string }[] = [];
      for (const uid of testIds) {
        try {
          const chunks: any[][] = [];
          for (let i = 0; i < testMsgs.length; i += 5) chunks.push(testMsgs.slice(i, i + 5));
          let ok = true, lastErr = "";
          for (const ch of chunks) {
            const res = await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel_access_token}` },
              body: JSON.stringify({ to: uid.trim(), messages: ch }),
            });
            if (!res.ok) { ok = false; lastErr = (await res.text()).slice(0, 500); break; }
          }
          if (ok) success++; else { failed++; errors.push({ id: uid, error: lastErr }); }
        } catch (e: any) {
          failed++; errors.push({ id: uid, error: String(e?.message || e).slice(0, 500) });
        }
        await sleep(RATE_DELAY_MS);
      }
      return Response.json({ ok: true, test: true, success, failed, errors }, { headers: corsHeaders });
    }

    // ============ REAL BROADCAST ============
    const campaignId: string | undefined = body.campaign_id;
    if (!campaignId) {
      return Response.json({ error: "Missing campaign_id" }, { status: 400, headers: corsHeaders });
    }

    // Load campaign
    const { data: campaign, error: cErr } = await admin
      .from("broadcast_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (cErr || !campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404, headers: corsHeaders });
    }
    // Allow re-trigger from sending (stuck) too
    if (!["scheduled", "draft", "failed", "sending"].includes(campaign.status)) {
      return Response.json({
        error: `Campaign is in status '${campaign.status}', cannot send`,
      }, { status: 400, headers: corsHeaders });
    }

    const lineMessages = normalizeMessages(campaign.messages || []);
    if (lineMessages.length === 0) {
      return Response.json({ error: "No valid messages" }, { status: 400, headers: corsHeaders });
    }


    // Build target query
    const tags: string[] = campaign.target_tags || [];
    const statuses: string[] = campaign.target_statuses || [];
    const excludeTags: string[] = campaign.exclude_tags || [];
    const excludeStatuses: string[] = campaign.exclude_statuses || [];
    const matchMode: string = campaign.target_match_mode || "any";

    let q = admin.from("customers").select("id, line_user_id, tags, status").not("line_user_id", "is", null);

    if (matchMode === "all") {
      if (tags.length) q = q.contains("tags", tags);
      if (statuses.length) q = q.in("status", statuses);
      if (!tags.length && !statuses.length) {
        return Response.json({ error: "No target filter" }, { status: 400, headers: corsHeaders });
      }
    } else {
      // ANY: tag overlaps OR status in list
      if (tags.length && statuses.length) {
        const tagList = tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
        const statusList = statuses.map((s) => `"${s}"`).join(",");
        q = q.or(`tags.ov.{${tagList}},status.in.(${statusList})`);
      } else if (tags.length) {
        q = q.overlaps("tags", tags);
      } else if (statuses.length) {
        q = q.in("status", statuses);
      } else {
        return Response.json({ error: "No target filter" }, { status: 400, headers: corsHeaders });
      }
    }

    const { data: targets, error: tErr } = await q.limit(5000);
    if (tErr) {
      return Response.json({ error: tErr.message }, { status: 500, headers: corsHeaders });
    }

    // Apply exclude filter in JS (NOT overlaps tricky in supabase-js)
    const excludeTagSet = new Set(excludeTags);
    const excludeStatusSet = new Set(excludeStatuses);
    const recipients = (targets || []).filter((c: any) => {
      if (!c.line_user_id) return false;
      if (excludeStatusSet.size && excludeStatusSet.has(c.status)) return false;
      if (excludeTagSet.size && Array.isArray(c.tags) && c.tags.some((t: string) => excludeTagSet.has(t))) return false;
      return true;
    });

    // Clear old recipients (in case of resend) + insert new
    await admin.from("broadcast_recipients").delete().eq("campaign_id", campaignId);

    if (recipients.length === 0) {
      await admin.from("broadcast_campaigns").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        total_recipients: 0,
        success_count: 0,
        failed_count: 0,
      }).eq("id", campaignId);
      return Response.json({ ok: true, total: 0, success: 0, failed: 0 }, { headers: corsHeaders });
    }

    // Insert recipients in chunks of 500
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500).map((c: any) => ({
        campaign_id: campaignId,
        customer_id: c.id,
        line_user_id: c.line_user_id,
        status: "pending",
      }));
      await admin.from("broadcast_recipients").insert(chunk);
    }

    // Mark campaign sending
    await admin.from("broadcast_campaigns").update({
      status: "sending",
      total_recipients: recipients.length,
      success_count: 0,
      failed_count: 0,
    }).eq("id", campaignId);

    const messageText = lineMessages.map(bubbleToText).join("\n");


    let success = 0;
    let failed = 0;

    for (const r of recipients) {
      // chunk 5
      const chunks: any[][] = [];
      for (let i = 0; i < lineMessages.length; i += 5) {
        chunks.push(lineMessages.slice(i, i + 5));
      }

      let ok = true;
      let lastErr = "";
      let firstSentId: string | null = null;
      for (const ch of chunks) {
        try {
          const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channel_access_token}`,
            },
            body: JSON.stringify({ to: r.line_user_id, messages: ch }),
          });
          if (!res.ok) {
            ok = false;
            lastErr = (await res.text()).slice(0, 500);
            break;
          }
          if (!firstSentId) {
            try {
              const body = await res.json();
              const sm = body?.sentMessages?.[0];
              if (sm?.id) firstSentId = sm.id;
            } catch {}
          }
        } catch (e: any) {
          ok = false;
          lastErr = String(e?.message || e).slice(0, 500);
          break;
        }
      }

      const now = new Date().toISOString();
      if (ok) {
        success++;
        await admin.from("broadcast_recipients").update({
          status: "sent", sent_at: now,
        }).eq("campaign_id", campaignId).eq("line_user_id", r.line_user_id);

        // Log conversation as admin broadcast
        if (r.id) {
          await admin.from("conversations").insert({
            customer_id: r.id,
            message: `📣 [Broadcast]\n${messageText}`,
            sender: "admin",
            line_message_id: firstSentId,
          });
          await admin.from("customers").update({
            last_message_at: now,
            last_message_snippet: `📣 ${messageText.slice(0, 60)}`,
          }).eq("id", r.id);
        }
      } else {
        failed++;
        await admin.from("broadcast_recipients").update({
          status: "failed", error_message: lastErr, sent_at: now,
        }).eq("campaign_id", campaignId).eq("line_user_id", r.line_user_id);
      }

      await sleep(RATE_DELAY_MS);
    }

    await admin.from("broadcast_campaigns").update({
      status: failed === recipients.length ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      success_count: success,
      failed_count: failed,
    }).eq("id", campaignId);

    return Response.json({
      ok: true, total: recipients.length, success, failed,
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("[broadcast-send]", err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
