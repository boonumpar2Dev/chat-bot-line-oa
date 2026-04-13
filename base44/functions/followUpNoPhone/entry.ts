import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Load settings
    const cfgList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' });
    const cfg = cfgList[0] || {};

    if (cfg.followup_enabled === false) {
      return Response.json({ ok: true, skipped: true, reason: 'followup_disabled' });
    }

    const followupHours = cfg.followup_hours || 2;
    const cutoff = new Date(Date.now() - followupHours * 3600000).toISOString();

    // Get all customers who: have no phone, status is 'new', ai_active is true
    const customers = await base44.asServiceRole.entities.Customer.filter({ status: 'new' });

    const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    let sentCount = 0;

    for (const cust of customers) {
      // Skip if already has phone
      if (cust.phone) continue;

      // Skip if AI is off
      if (!cust.ai_active) continue;

      // Skip if manual chat timer is active
      if (cust.manual_chat_until && new Date(cust.manual_chat_until) > new Date()) continue;

      // Skip if last message is recent (within followup window)
      if (!cust.last_message_at || cust.last_message_at > cutoff) continue;

      // Check last conversation — don't follow up if last message was AI (avoid double follow-up)
      const recentConvs = await base44.asServiceRole.entities.Conversation.filter(
        { customer_id: cust.id }, '-created_date', 3
      );
      const lastMsg = recentConvs[0];
      if (lastMsg && lastMsg.sender === 'ai') continue;

      // Send follow-up via LINE push message — prefer nickname over LINE display name
      const name = cust.nickname || 'คุณลูกค้า';
      const followupText = `สวัสดีครับ ${name} 😊\n\nยังสนใจเรื่องจัดเลี้ยงอยู่ไหมครับ?\n\nถ้าสะดวก รบกวนฝากเบอร์โทรไว้ได้เลยนะครับ จะให้เจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดแพ็กเกจและคิวงานโดยตรงเลยครับ 🙏`;

      const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to: cust.line_user_id,
          messages: [{ type: 'text', text: followupText }],
        }),
      });

      if (pushRes.ok) {
        // Save to conversation
        await base44.asServiceRole.entities.Conversation.create({
          customer_id: cust.id,
          message: followupText,
          sender: 'ai',
        });
        await base44.asServiceRole.entities.Customer.update(cust.id, {
          last_message_at: new Date().toISOString(),
          last_message_snippet: `🤖 ${followupText.slice(0, 60)}`,
        });
        sentCount++;
        console.log(`[FollowUp] Sent to ${cust.line_user_id} (${name})`);
      } else {
        console.error(`[FollowUp] Failed for ${cust.line_user_id}:`, await pushRes.text());
      }
    }

    return Response.json({ ok: true, sent: sentCount });
  } catch (err) {
    console.error('followUpNoPhone error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});