import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function verifySignature(body, signature, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig))) === signature;
}

function getItemImages(item) {
  const arr = Array.isArray(item.image_urls) ? [...item.image_urls] : [];
  if (item.file_url && !arr.includes(item.file_url)) arr.unshift(item.file_url);
  return arr;
}

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature') || '';
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET') || '';

    if (channelSecret && !(await verifySignature(body, signature, channelSecret))) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { events = [] } = JSON.parse(body);
    const base44 = createClientFromRequest(req);

    for (const event of events) {
      if (event.type !== 'message' || event.message?.type !== 'text') continue;

      const lineUserId = event.source.userId;
      const messageText = event.message.text;
      const replyToken = event.replyToken;

      // Find or create customer
      const existing = await base44.asServiceRole.entities.Customer.filter({ line_user_id: lineUserId });
      let customer = existing[0];

      if (!customer) {
        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
          headers: { Authorization: `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}` }
        });
        const profile = profileRes.ok ? await profileRes.json() : {};
        customer = await base44.asServiceRole.entities.Customer.create({
          line_user_id: lineUserId,
          display_name: profile.displayName || 'ลูกค้าใหม่',
          picture_url: profile.pictureUrl || '',
          status: 'new',
          ai_active: true,
        });
      }

      // Save customer message
      await base44.asServiceRole.entities.Conversation.create({
        customer_id: customer.id,
        message: messageText,
        sender: 'customer',
      });

      if (!customer.ai_active) continue;

      // Get AI settings
      const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' });
      const cfg = settingsList[0] || {};
      if (cfg.ai_enabled === false) continue;

      // Check schedule
      if (cfg.schedule_enabled) {
        const bkk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const hhmm = bkk.getHours() * 60 + bkk.getMinutes();
        const [sh, sm] = (cfg.start_time || '18:00').split(':').map(Number);
        const [eh, em] = (cfg.end_time || '08:00').split(':').map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        const inWindow = start > end ? (hhmm >= start || hhmm < end) : (hhmm >= start && hhmm < end);
        if (!inWindow) continue;
      }

      // Check cooldown
      const cooldownMs = (cfg.cooldown_minutes || 1) * 60 * 1000;
      const recentConvs = await base44.asServiceRole.entities.Conversation.filter({ customer_id: customer.id }, 'created_date', 50);
      const lastAdmin = [...recentConvs].reverse().find(m => m.sender === 'admin');
      if (lastAdmin && Date.now() - new Date(lastAdmin.created_date).getTime() < cooldownMs) continue;

      // Build context from knowledge base
      const kb = await base44.asServiceRole.entities.KnowledgeBase.filter({ status: 'active' });
      const itemsWithImages = kb.filter(i => getItemImages(i).length > 0);

      const context = kb.map(k => {
        const imgs = getItemImages(k);
        return `## ${k.title}\n${k.content}${imgs.length > 0 ? `\n[มีรูปภาพประกอบ ${imgs.length} รูป]` : ''}`;
      }).join('\n\n');

      const imageListStr = itemsWithImages.length > 0
        ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${itemsWithImages.map(i => `"${i.title}"`).join(', ')}`
        : '';

      // Build strict rules section
      const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
        ? cfg.strict_rules.filter(r => r && r.trim()).map((r, i) => `${i + 1}. ${r}`).join('\n')
        : '';
      const strictRulesSection = strictRules
        ? `\n\n⚠️ กฎเข้มงวดที่ต้องปฏิบัติตามเสมอ:\n${strictRules}`
        : '';

      // Generate AI reply with image selection
      const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `คุณคือ AI ผู้ช่วยสำหรับธุรกิจจัดงานและจัดเลี้ยง ตอบเป็นภาษาไทย กระชับ เป็นกันเอง ห้ามยาวเกิน 200 คำ ห้ามแต่งข้อมูลเอง
${strictRulesSection}

ข้อมูลธุรกิจ:
${context || '(ยังไม่มีข้อมูลธุรกิจ)'}
${imageListStr}

ลูกค้าส่งมาว่า: "${messageText}"

ถ้าคำตอบเกี่ยวข้องกับข้อมูลที่มีรูปภาพ ให้ระบุชื่อข้อมูลนั้นใน image_titles เพื่อส่งรูปให้ลูกค้าประกอบ (ส่งได้สูงสุด 3 รูป)`,
        response_json_schema: {
          type: 'object',
          properties: {
            answer: { type: 'string', description: 'คำตอบสำหรับลูกค้า' },
            image_titles: {
              type: 'array',
              items: { type: 'string' },
              description: 'ชื่อข้อมูล KB ที่มีรูปภาพควรส่งให้ลูกค้าประกอบ'
            }
          },
          required: ['answer']
        }
      });

      const answerText = String(aiResponse.answer || 'ขออภัย ไม่สามารถตอบได้ในขณะนี้').slice(0, 5000);
      const imageTitles = aiResponse.image_titles || [];

      // Collect relevant images (max 3)
      const relevantImages = itemsWithImages
        .filter(item => imageTitles.includes(item.title))
        .flatMap(item => getItemImages(item))
        .slice(0, 3);

      // Build LINE messages
      const lineMessages = [{ type: 'text', text: answerText }];
      for (const imgUrl of relevantImages) {
        lineMessages.push({
          type: 'image',
          originalContentUrl: imgUrl,
          previewImageUrl: imgUrl,
        });
      }

      // Reply via LINE
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`,
        },
        body: JSON.stringify({ replyToken, messages: lineMessages }),
      });

      // Save AI reply to DB
      const savedMsg = relevantImages.length > 0
        ? `${answerText}\n${relevantImages.map(u => `📎 ${u}`).join('\n')}`
        : answerText;

      await base44.asServiceRole.entities.Conversation.create({
        customer_id: customer.id,
        message: savedMsg,
        sender: 'ai',
        confidence_score: 85,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('lineWebhook error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});