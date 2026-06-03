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

    const recipients = (targets || []).filter((c: any) => c.line_user_id);

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
