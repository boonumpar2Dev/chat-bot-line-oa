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

// Statuses where AI must be force-off
const AI_OFF_STATUSES = ['pending_quote', 'pending_confirm', 'confirmed'];

Deno.serve(async (req) => {
  try {
    // Clone request before consuming body, so SDK can still read headers from original
    const clonedReq = req.clone();
    const body = await clonedReq.text();
    const signature = req.headers.get('x-line-signature') || '';
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET') || '';

    console.log('Webhook received, body length:', body.length, 'has signature:', !!signature);
    
    if (channelSecret && signature && !(await verifySignature(body, signature, channelSecret))) {
      console.error('Signature verification failed');
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { events = [] } = JSON.parse(body);
    const base44 = createClientFromRequest(req);

    for (const event of events) {
      if (event.type !== 'message') continue;

      const msgType = event.message?.type;
      const lineUserId = event.source.userId;
      const replyToken = event.replyToken;

      // Determine message text based on type
      let messageText;
      let isTextMessage = false;
      if (msgType === 'text') {
        messageText = event.message.text;
        isTextMessage = true;
      } else if (msgType === 'sticker') {
        messageText = '[สติกเกอร์]';
      } else if (msgType === 'image') {
        messageText = '[รูปภาพ]';
      } else if (msgType === 'video') {
        messageText = '[วิดีโอ]';
      } else if (msgType === 'audio') {
        messageText = '[เสียง]';
      } else if (msgType === 'location') {
        messageText = `[ตำแหน่ง: ${event.message.title || event.message.address || 'ไม่ระบุ'}]`;
      } else if (msgType === 'file') {
        messageText = `[ไฟล์: ${event.message.fileName || 'ไม่ระบุ'}]`;
      } else {
        messageText = `[${msgType || 'ไม่ทราบประเภท'}]`;
      }

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

      // Only process AI reply for text messages
      if (!isTextMessage) continue;

      // Get AI settings
      const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' });
      const cfg = settingsList[0] || {};

      // ──── Stage Control: Skip AI for critical statuses ────
      if (AI_OFF_STATUSES.includes(customer.status)) continue;

      // ──── Check if AI is manually disabled for this customer ────
      if (!customer.ai_active) continue;

      // ──── Global AI toggle ────
      if (cfg.ai_enabled === false) continue;

      // ──── Check schedule (AI working hours) ────
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

      // ──── Handoff Cooldown: check last admin message ────
      const cooldownMs = (cfg.cooldown_minutes || 1) * 60 * 1000;
      const recentConvs = await base44.asServiceRole.entities.Conversation.filter({ customer_id: customer.id }, 'created_date', 50);
      const lastAdmin = [...recentConvs].reverse().find(m => m.sender === 'admin');
      if (lastAdmin && Date.now() - new Date(lastAdmin.created_date).getTime() < cooldownMs) continue;

      // ──── Build context from knowledge base ────
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

      const topicNames = kb.map(k => k.title).filter(Boolean);
      const confidenceThreshold = cfg.confidence_threshold || 75;

      // ──── Build conversation history for context ────
      const recentMsgs = recentConvs.slice(-10).map(m => {
        const role = m.sender === 'customer' ? 'ลูกค้า' : (m.sender === 'admin' ? 'แอดมิน' : 'AI');
        return `${role}: ${m.message}`;
      }).join('\n');

      // ──── Generate AI reply ────
      const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `คุณคือ AI ผู้ช่วยสำหรับธุรกิจจัดงานและจัดเลี้ยง ตอบเป็นภาษาไทย กระชับ เป็นกันเอง ห้ามยาวเกิน 200 คำ

หลักการตอบ:
- ตอบจากข้อมูลใน Knowledge Base เท่านั้น ห้ามแต่งข้อมูลตัวเลข ราคา รายละเอียดที่ไม่มีอยู่
- ถ้าลูกค้าทักทายกว้างๆ เช่น "สอบถามค่ะ" "สวัสดีค่ะ" "สนใจค่ะ" → ให้ต้อนรับอย่างอบอุ่นและแนะนำหัวข้อบริการ/ข้อมูลที่มีอยู่ให้ลูกค้าเลือกถาม
- หัวข้อข้อมูลที่มีอยู่: ${topicNames.length > 0 ? topicNames.join(', ') : 'ยังไม่มีข้อมูล'}
- ถ้าลูกค้าถามเรื่องที่ไม่มีใน Knowledge Base เลย → ตอบสุภาพว่าจะให้เจ้าหน้าที่ติดต่อกลับ
- จัดรูปแบบข้อความให้อ่านง่าย ใช้การเว้นบรรทัดจริงๆ แยกหัวข้อ/ประเด็นให้ชัดเจน ห้ามใส่ \\n เป็นตัวอักษร
- เมื่อมีหลายประเด็น ให้เว้นบรรทัดระหว่างแต่ละประเด็น
${strictRulesSection}

ข้อมูลธุรกิจ:
${context || '(ยังไม่มีข้อมูลธุรกิจ)'}
${imageListStr}

ประวัติการสนทนาล่าสุด:
${recentMsgs || '(ยังไม่มี)'}

ลูกค้าส่งมาว่า: "${messageText}"

ตอบเป็น JSON โดย:
- answer: คำตอบ (ใช้การขึ้นบรรทัดใหม่จริงๆ เพื่อจัดรูปแบบ)
- confidence: คะแนนความมั่นใจ 0-100 ว่าคำตอบถูกต้องตาม KB
- image_titles: ชื่อข้อมูล KB ที่มีรูปภาพควรส่งประกอบ (สูงสุด 3)`,
        model: 'gemini_3_flash',
        response_json_schema: {
          type: 'object',
          properties: {
            answer: { type: 'string', description: 'คำตอบสำหรับลูกค้า' },
            confidence: { type: 'number', description: 'ความมั่นใจ 0-100' },
            image_titles: {
              type: 'array',
              items: { type: 'string' },
              description: 'ชื่อข้อมูล KB ที่มีรูปภาพควรส่งให้ลูกค้าประกอบ'
            }
          },
          required: ['answer', 'confidence']
        }
      });

      const confidence = typeof aiResponse.confidence === 'number' ? aiResponse.confidence : 85;

      // ──── Zero Hallucination: if confidence below threshold, skip AI reply ────
      if (confidence < confidenceThreshold) continue;

      // ──── Process answer text ────
      const answerText = String(aiResponse.answer || 'ขออภัย ไม่สามารถตอบได้ในขณะนี้')
        .replace(/\\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 5000);
      const imageTitles = aiResponse.image_titles || [];

      // ──── Image dedup logic ────
      const allRelevantImages = itemsWithImages
        .filter(item => imageTitles.includes(item.title));

      const lastSent = Array.isArray(customer.last_sent_image_titles) ? customer.last_sent_image_titles : [];
      const sortedCurrent = [...imageTitles].sort().join('|');
      const sortedLast = [...lastSent].sort().join('|');
      const isSameTitles = sortedCurrent === sortedLast && sortedCurrent.length > 0;
      const imagesToSend = isSameTitles ? [] : allRelevantImages.flatMap(item => getItemImages(item)).slice(0, 3);

      // ──── Build LINE messages ────
      const lineMessages = [{ type: 'text', text: answerText }];
      for (const imgUrl of imagesToSend) {
        lineMessages.push({
          type: 'image',
          originalContentUrl: imgUrl,
          previewImageUrl: imgUrl,
        });
      }

      // ──── Reply via LINE ────
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`,
        },
        body: JSON.stringify({ replyToken, messages: lineMessages }),
      });

      // ──── Update customer tracking ────
      if (imageTitles.length > 0) {
        await base44.asServiceRole.entities.Customer.update(customer.id, {
          last_sent_image_titles: imageTitles,
        });
      }

      // ──── Save AI reply to DB ────
      const savedMsg = imagesToSend.length > 0
        ? `${answerText}\n${imagesToSend.map(u => `📎 ${u}`).join('\n')}`
        : answerText;

      await base44.asServiceRole.entities.Conversation.create({
        customer_id: customer.id,
        message: savedMsg,
        sender: 'ai',
        confidence_score: confidence,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('lineWebhook error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});