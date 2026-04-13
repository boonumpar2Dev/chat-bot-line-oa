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
    if (events.length === 0) {
      return Response.json({ ok: true }); // LINE verification ping
    }

    let base44;
    try {
      base44 = createClientFromRequest(req);
    } catch (e) {
      console.error('SDK init error (non-fatal for webhook):', e.message);
      // Fallback: create from minimal request with just app context
      base44 = createClientFromRequest(new Request(req.url, {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    for (const event of events) {
      const lineUserId = event.source?.userId;
      
      console.log(`[Event] type=${event.type} mode=${event.mode} userId=${lineUserId}`);

      // ──── Chat Control Detection: mode "standby" means admin switched to Manual Chat ────
      if (event.mode === 'standby') {
        if (lineUserId) {
          const existing = await base44.asServiceRole.entities.Customer.filter({ line_user_id: lineUserId });
          if (existing[0]) {
            const customer = existing[0];
            // Set manual timer if not already set
            if (!customer.manual_chat_until || new Date(customer.manual_chat_until) < new Date()) {
              const [cfgList] = await Promise.all([
                base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' }),
              ]);
              const manualHours = cfgList[0]?.manual_chat_hours || 360;
              const until = new Date(Date.now() + manualHours * 3600000).toISOString();
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                ai_active: false,
                manual_chat_until: until,
              });
              console.log(`[ChatControl] Muted AI for ${lineUserId} until ${until} (${manualHours}h)`);
            }

            // Save the message even in standby mode (for dedup when LINE re-delivers)
            if (event.type === 'message' && event.message) {
              const lineMsgId = event.message.id;
              // Build message text
              let standbyText;
              if (event.message.type === 'text') {
                standbyText = event.message.text;
              } else if (event.message.type === 'sticker') {
                const stkId = event.message.stickerId;
                standbyText = `[สติกเกอร์]\n🎭 https://stickershop.line-scdn.net/stickershop/v1/sticker/${stkId}/android/sticker.png`;
              } else if (event.message.type === 'location') {
                standbyText = `[ตำแหน่ง: ${event.message.title || event.message.address || 'ไม่ระบุ'}]`;
              } else {
                const label = event.message.type === 'image' ? 'รูปภาพ' : event.message.type === 'video' ? 'วิดีโอ' : event.message.type === 'audio' ? 'เสียง' : 'ไฟล์';
                standbyText = `[${label}]`;
              }
              await base44.asServiceRole.entities.Conversation.create({
                customer_id: customer.id,
                message: standbyText,
                sender: 'customer',
                line_message_id: lineMsgId,
              });
              const snippet = standbyText.replace(/\[.*?\]\n?/, '').trim().slice(0, 60) || standbyText.slice(0, 60);
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                unread_count: (customer.unread_count || 0) + 1,
                last_message_at: new Date().toISOString(),
                last_message_snippet: snippet,
              });
              console.log(`[Standby] Saved message ${lineMsgId} for ${lineUserId} (no AI reply)`);
            }
          }
        }
        continue; // Don't process standby events further — bot should not reply
      }

      if (event.type !== 'message') continue;

      const msgType = event.message?.type;
      const replyToken = event.replyToken;

      // Determine message text based on type
      let messageText;
      let isTextMessage = false;

      if (msgType === 'text') {
        messageText = event.message.text;
        isTextMessage = true;
      } else if (msgType === 'image' || msgType === 'video' || msgType === 'audio' || msgType === 'file') {
        // Download binary content from LINE and upload to Base44
        const messageId = event.message.id;
        const ext = msgType === 'image' ? '.jpg' : msgType === 'video' ? '.mp4' : msgType === 'audio' ? '.m4a' : '';
        const fileName = event.message?.fileName || `${msgType}_${messageId}${ext}`;
        const label = msgType === 'image' ? 'รูปภาพ' : msgType === 'video' ? 'วิดีโอ' : msgType === 'audio' ? 'เสียง' : 'ไฟล์';

        let fileUrl = null;
        try {
          const contentRes = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (contentRes.ok) {
            const blob = await contentRes.blob();
            const file = new File([blob], fileName, { type: blob.type });
            const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            fileUrl = uploadResult.file_url;
          }
        } catch (e) {
          console.error('Failed to download/upload LINE content:', e.message);
        }

        if (fileUrl) {
          messageText = `[${label}]\n📎 ${fileUrl}\n📛 ${fileName}`;
        } else {
          messageText = `[${label}]`;
        }
      } else if (msgType === 'sticker') {
        const pkgId = event.message.packageId;
        const stkId = event.message.stickerId;
        const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stkId}/android/sticker.png`;
        messageText = `[สติกเกอร์]\n🎭 ${stickerUrl}`;
      } else if (msgType === 'location') {
        messageText = `[ตำแหน่ง: ${event.message.title || event.message.address || 'ไม่ระบุ'}]`;
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

      // Save customer message (dedup by LINE message ID)
      const lineMsgId = event.message?.id || null;
      if (lineMsgId) {
        const existingMsgs = await base44.asServiceRole.entities.Conversation.filter({ line_message_id: lineMsgId });
        if (existingMsgs.length > 0) {
          console.log(`[Dedup] Message ${lineMsgId} already saved — skipping entire processing`);
          continue;
        }
      }
      await base44.asServiceRole.entities.Conversation.create({
        customer_id: customer.id,
        message: messageText,
        sender: 'customer',
        line_message_id: lineMsgId,
      });

      // Update unread count, last message time & snippet for chat list
      const snippet = messageText.replace(/\[.*?\]\n?/, '').replace(/📎\s*https?:\/\/\S+/g, '').replace(/📛\s*.+/g, '').trim().slice(0, 60) || messageText.slice(0, 60);
      await base44.asServiceRole.entities.Customer.update(customer.id, {
        unread_count: (customer.unread_count || 0) + 1,
        last_message_at: new Date().toISOString(),
        last_message_snippet: snippet,
      });

      // Only process AI reply for text messages
      if (!isTextMessage) continue;

      // ──── Keyword Filtering: skip trivial messages to save tokens ────
      const trimmedMsg = messageText.trim().toLowerCase();
      const trivialPatterns = ['👍', '👌', 'ok', 'oki', 'ได้เลย', 'โอเค', 'ขอบคุณ', 'ขอบคุณค่ะ', 'ขอบคุณครับ', 'ค่ะ', 'ครับ', 'ดีค่ะ', 'ดีครับ'];
      if (trimmedMsg.length <= 3 && !trimmedMsg.match(/[?？]/)) continue;
      if (trivialPatterns.includes(trimmedMsg)) continue;

      // ──── Phone Number Detection (no AI needed) ────
      // Strategy: find digit sequences, auto-correct to 10 digits if possible
      const pureDigits = messageText.replace(/[\s\-().+]/g, '');
      const isPureNumber = /^\d+$/.test(pureDigits);
      
      // Extract all phone-like sequences: digits possibly separated by - ( ) . or spaces
      const phoneSeqs = messageText.match(/\d[\d\s\-().]{6,25}\d/g) || [];
      let phoneCandidate = null;
      
      if (isPureNumber && pureDigits.length >= 7 && pureDigits.length <= 15) {
        phoneCandidate = pureDigits;
      } else {
        for (const seq of phoneSeqs) {
          const digits = seq.replace(/[^0-9]/g, '');
          if (digits.length >= 7 && digits.length <= 15) {
            phoneCandidate = digits;
            break;
          }
        }
      }
      // Only treat as phone if message is mostly numbers
      if (phoneCandidate) {
        const nonDigitText = messageText.replace(/[0-9\s\-().+]/g, '').trim();
        if (nonDigitText.length > 15) phoneCandidate = null;
      }
      
      if (phoneCandidate) {
        if (/^0\d{9}$/.test(phoneCandidate) && phoneCandidate.length === 10) {
          // Valid 10-digit Thai phone → save + summarize + mute AI
          // Get phone_mute_hours from settings
          const [phoneCfgList] = await Promise.all([
            base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' }),
          ]);
          const phoneMuteHours = phoneCfgList[0]?.phone_mute_hours ?? 1;
          await base44.asServiceRole.entities.Customer.update(customer.id, { 
            phone: phoneCandidate,
            ai_active: false,
            manual_chat_until: new Date(Date.now() + phoneMuteHours * 3600000).toISOString(),
          });
          
          // Re-read customer for summary
          const updatedCustomers = await base44.asServiceRole.entities.Customer.filter({ line_user_id: lineUserId });
          const updatedCust = updatedCustomers[0] || customer;
          
          const fmtPhone = phoneCandidate.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
          let summaryLines = [`ขอบคุณสำหรับข้อมูลครับ เพื่อให้ข้อมูลที่ถูกต้องแม่นยำที่สุด รอสักครู่นะครับ`];
          summaryLines.push('');
          summaryLines.push(`จะประสานงานเจ้าหน้าที่ผู้เชี่ยวชาญติดต่อกลับไปแจ้งรายละเอียดคิวงานและแพ็กเกจโดยตรงเลยครับ`);
          summaryLines.push('');
          summaryLines.push(`📋 สรุปข้อมูลที่ได้รับ:`);
          summaryLines.push(`- ชื่อ: ${updatedCust.nickname || updatedCust.display_name || '-'}`);
          summaryLines.push(`- เบอร์โทร: ${fmtPhone}`);
          if (updatedCust.event_type) summaryLines.push(`- ประเภทงาน: ${updatedCust.event_type}`);
          if (updatedCust.venue) summaryLines.push(`- สถานที่/จังหวัด: ${updatedCust.venue}`);
          if (updatedCust.event_date) summaryLines.push(`- วันจัดงาน: ${updatedCust.event_date}`);
          if (updatedCust.guest_count) summaryLines.push(`- จำนวนคน: ${updatedCust.guest_count} ท่าน`);
          
          const confirmText = summaryLines.join('\n');
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: confirmText }] }),
          });
          await base44.asServiceRole.entities.Conversation.create({ customer_id: customer.id, message: confirmText, sender: 'ai' });
          await base44.asServiceRole.entities.Customer.update(customer.id, { last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${confirmText.slice(0, 60)}` });
          console.log(`[Phone] Saved ${phoneCandidate} for ${lineUserId}, AI muted 1hr`);
          continue;
        } else if (phoneCandidate.length !== 10 && phoneCandidate.length >= 7) {
          // Wrong digit count → always ask customer to re-enter
          const nonDigitText = messageText.replace(/[0-9\s\-().+]/g, '').trim();
          if (nonDigitText.length <= 15) {
            const errorText = `ขออภัยครับ เบอร์โทรที่ให้มา "${phoneCandidate}" มี ${phoneCandidate.length} หลักครับ\n\nเบอร์โทรศัพท์ไทยต้อง 10 หลัก เริ่มต้นด้วย 0 เช่น 081-234-5678\nรบกวนทวนเบอร์อีกครั้งนะครับ 🙏`;
            await fetch('https://api.line.me/v2/bot/message/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: errorText }] }),
            });
            await base44.asServiceRole.entities.Conversation.create({ customer_id: customer.id, message: errorText, sender: 'ai' });
            await base44.asServiceRole.entities.Customer.update(customer.id, { last_message_at: new Date().toISOString(), last_message_snippet: `🤖 ${errorText.slice(0, 60)}` });
            console.log(`[Phone] Invalid ${phoneCandidate} (${phoneCandidate.length} digits) for ${lineUserId}`);
            continue;
          }
        }
      }

      // ──── Re-read customer to catch admin handoff that happened between message save and now ────
      const freshCustomers = await base44.asServiceRole.entities.Customer.filter({ line_user_id: lineUserId });
      const freshCustomer = freshCustomers[0] || customer;

      // ──── Stage Control: Skip AI for critical statuses ────
      if (AI_OFF_STATUSES.includes(freshCustomer.status)) {
        console.log(`[StageControl] AI blocked for ${lineUserId} — status: ${freshCustomer.status}`);
        continue;
      }

      // ──── Check Manual Chat Timer: override LINE's 1-min limit ────
      if (freshCustomer.manual_chat_until && new Date(freshCustomer.manual_chat_until) > new Date()) {
        console.log(`[ManualTimer] AI blocked for ${lineUserId} — timer until ${freshCustomer.manual_chat_until}`);
        continue;
      }

      // ──── Check if AI is manually disabled for this customer ────
      if (!freshCustomer.ai_active) {
        console.log(`[AIDisabled] AI blocked for ${lineUserId} — ai_active is false`);
        continue;
      }

      // ──── Fetch all AI data in parallel for speed ────
      const [settingsList, recentConvs, kb, pkgs, promos] = await Promise.all([
        base44.asServiceRole.entities.AppSettings.filter({ key: 'ai_config' }),
        base44.asServiceRole.entities.Conversation.filter({ customer_id: customer.id }, 'created_date', 50),
        base44.asServiceRole.entities.KnowledgeBase.filter({ status: 'active' }),
        base44.asServiceRole.entities.CateringPackage.filter({ is_active: true }),
        base44.asServiceRole.entities.Promotion.filter({ is_active: true }),
      ]);
      const cfg = settingsList[0] || {};

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
      const lastAdmin = [...recentConvs].reverse().find(m => m.sender === 'admin');
      if (lastAdmin && Date.now() - new Date(lastAdmin.created_date).getTime() < cooldownMs) continue;
      const itemsWithImages = kb.filter(i => getItemImages(i).length > 0);

      // Add packages as image sources too
      const pkgsWithImages = pkgs.filter(p => Array.isArray(p.image_urls) && p.image_urls.length > 0);

      const context = kb.map(k => {
        const imgs = getItemImages(k);
        return `## ${k.title}\n${k.content}${imgs.length > 0 ? `\n[มีรูปภาพประกอบ ${imgs.length} รูป]` : ''}`;
      }).join('\n\n');

      // Build catering package context
      const pkgContext = pkgs.length > 0 ? '\n\n--- แคตตาล็อกแพ็กเกจ ---\n' + pkgs.map(p => {
        let s = `## แพ็กเกจ: ${p.name}`;
        if (p.category) s += `\nประเภท: ${p.category}`;
        if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
        if (p.pricing_tiers?.length > 0) {
          s += '\nราคา:';
          p.pricing_tiers.forEach(t => {
            const total = t.total_pax || 0;
            const monk = t.monk_pax || 0;
            const guest = t.guest_pax || (total - monk);
            const tierLabel = t.tier_name ? `[${t.tier_name}] ` : '';
            if (total > 0 && monk > 0) {
              s += `\n  - ${tierLabel}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${t.price}`;
            } else if (t.guest_count) {
              s += `\n  - ${tierLabel}${t.guest_count}: ${t.price}`;
            } else {
              s += `\n  - ${tierLabel}${total || '?'} ท่าน: ${t.price}`;
            }
          });
        }
        // Custom Attributes (Key-Value)
        if (Array.isArray(p.custom_attributes) && p.custom_attributes.length > 0) {
          s += '\nข้อมูลเพิ่มเติม:';
          p.custom_attributes.forEach(attr => {
            if (attr.label && attr.value) s += `\n  - ${attr.label}: ${attr.value}`;
          });
        }
        if (p.description) s += `\nรายละเอียดอาหาร:\n${p.description}`;
        if (p.notes) s += `\nหมายเหตุ: ${p.notes}`;
        // AI Instruction for this package
        if (p.ai_instruction) s += `\n🤖 คำสั่ง AI สำหรับแพ็กเกจนี้: ${p.ai_instruction}`;
        if (p.image_urls?.length > 0) s += `\n[มีรูปภาพโบรชัวร์ ${p.image_urls.length} รูป]`;
        return s;
      }).join('\n\n') : '';

      // Build promotion context
      const promosWithImages = (promos || []).filter(p => p.image_urls?.length > 0);
      const promoContext = (promos || []).length > 0 ? '\n\n--- โปรโมชั่นปัจจุบัน ---\n' + promos.map(pr => {
        let s = `## โปรโมชั่น: ${pr.name}`;
        if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(', ')}`;
        if (pr.description) s += `\n${pr.description}`;
        if (pr.image_urls?.length > 0) s += `\n[มีรูปโปรโมชั่น ${pr.image_urls.length} รูป]`;
        return s;
      }).join('\n\n') : '';

      const allImageSources = [
        ...itemsWithImages.map(i => `"${i.title}"`),
        ...pkgsWithImages.map(p => `"แพ็กเกจ: ${p.name}"`),
        ...promosWithImages.map(pr => `"โปรโมชั่น: ${pr.name}"`),
      ];
      const imageListStr = allImageSources.length > 0
        ? `\n\nรายชื่อข้อมูลที่มีรูปภาพ: ${allImageSources.join(', ')}`
        : '';

      // Build strict rules section
      const strictRules = Array.isArray(cfg.strict_rules) && cfg.strict_rules.length > 0
        ? cfg.strict_rules.filter(r => r && r.trim()).map((r, i) => `${i + 1}. ${r}`).join('\n')
        : '';
      const strictRulesSection = strictRules
        ? `\n\n⚠️ กฎเข้มงวดที่ต้องปฏิบัติตามเสมอ:\n${strictRules}`
        : '';

      const topicNames = [
        ...kb.map(k => k.title).filter(Boolean),
        ...pkgs.map(p => `แพ็กเกจ: ${p.name}`).filter(Boolean),
      ];
      const confidenceThreshold = cfg.confidence_threshold || 75;

      // ──── Build conversation history for context (only after last admin message) ────
      // If admin recently replied, AI should only see messages AFTER the last admin message
      // This prevents AI from "catching up" on old unanswered messages
      let historyConvs = recentConvs.slice(-12);
      const lastAdminIdx = historyConvs.map((m, i) => m.sender === 'admin' ? i : -1).filter(i => i >= 0).pop();
      if (lastAdminIdx !== undefined && lastAdminIdx >= 0) {
        historyConvs = historyConvs.slice(lastAdminIdx);
      } else {
        historyConvs = historyConvs.slice(-6);
      }
      const recentMsgs = historyConvs.map(m => {
        const role = m.sender === 'customer' ? 'ลูกค้า' : (m.sender === 'admin' ? 'แอดมิน' : 'AI');
        return `${role}: ${m.message}`;
      }).join('\n');

      // ──── Generate AI reply ────
      const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `คุณคือ AI ผู้ช่วยสำหรับธุรกิจจัดงานและจัดเลี้ยง ตอบเป็นภาษาไทย กระชับ เป็นกันเอง ห้ามยาวเกิน 200 คำ

หลักการตอบ:
- ตอบจากข้อมูลใน Knowledge Base เท่านั้น ห้ามแต่งข้อมูลตัวเลข ราคา รายละเอียดที่ไม่มีอยู่
- **ตอบคำถามลูกค้าก่อนเสมอ** — ถ้าลูกค้าถาม "รับจัดต่างจังหวัดไหม" ให้ตอบเรื่องจังหวัดก่อน แล้วค่อยถามข้อมูลเพิ่มเติม
- **ถามทีละเรื่อง ไม่ถามรวดเดียว** — อย่าถามประเภทงาน+จำนวนคน+วันจัด+เบอร์ พร้อมกัน ให้ถามทีละข้อตามบริบท เช่น ลูกค้าถามเรื่องจังหวัด → ตอบเรื่องจังหวัด แล้วถามจังหวัดไหน, จำนวนคนเท่าไหร่ (2 ข้อพอ)
- **ลำดับการเก็บข้อมูล**: ตอบคำถาม → ถามประเภทงาน → จังหวัด/สถานที่ → จำนวนคน → วันจัดงาน → สุดท้ายขอเบอร์โทร
- ถ้าลูกค้าทักทายกว้างๆ เช่น "สอบถามค่ะ" "สวัสดีค่ะ" "สนใจค่ะ" → ให้ต้อนรับอย่างอบอุ่น แล้วถามว่าสนใจงานแบบไหน
- ห้ามแสดงรายการหัวข้อให้ลูกค้าเลือก ห้ามบอกว่า "มีหัวข้อดังนี้..." เพราะดูเหมือนเมนูหุ่นยนต์ ให้สนทนาเป็นธรรมชาติแทน
- ถ้าลูกค้าถามเรื่องที่ไม่มีใน Knowledge Base เลย → ตอบสุภาพว่าจะให้เจ้าหน้าที่ติดต่อกลับ
- จัดรูปแบบข้อความให้อ่านง่าย ใช้การขึ้นบรรทัดใหม่จริงๆ (newline character) แยกหัวข้อ/ประเด็นให้ชัดเจน
- ห้ามใส่ \\n เป็นตัวอักษร ต้องขึ้นบรรทัดใหม่จริงๆ
- ห้ามใช้ emoji แทนการขึ้นบรรทัดใหม่ ห้ามเขียนติดกันเป็นพรืดยาว
- แต่ละประเด็น/หัวข้อ ต้องแยกย่อหน้าชัดเจน เว้นบรรทัดว่างระหว่างกัน
- ใช้ตัวเลขหรือขีดกลาง (-) นำหน้าแต่ละหัวข้อย่อย แล้วขึ้นบรรทัดใหม่

🔴 กฎเหล็กเรื่องจำนวนคน (พระสงฆ์ + แขก) — ห้ามละเลย:
1. กฎการคำนวณ: เมื่อลูกค้าแจ้งจำนวนคน ต้องวิเคราะห์ก่อนว่าตัวเลขนั้น "รวมพระหรือยัง?" ถ้าลูกค้าพูดแค่ "40 คน" ต้องถามกลับว่ารวมพระสงฆ์หรือเปล่า ก่อนเสนอแพ็กเกจ
2. กฎการนำเสนอ: ทุกครั้งที่เสนอแพ็กเกจ บังคับอธิบายสัดส่วนเสมอ เช่น "แพ็กเกจ 40 ท่าน (รวมพระสงฆ์ 9 รูป + แขก 31 ท่าน)"
3. กฎป้องกันความผิดพลาด (Safety Check): หากลูกค้าบอก "มีแขก 40 ท่าน" (เฉพาะแขก ไม่รวมพระ) → ต้องเสนอแพ็กเกจที่ใหญ่กว่า เช่น 50 ท่าน (พระ 9 + แขก 41) เพื่อให้อาหารเพียงพอ พร้อมอธิบายเหตุผลสุภาพ
4. ห้ามเสนอแพ็กเกจที่มีจำนวนแขก (guest_pax) น้อยกว่าที่ลูกค้าต้องการ เด็ดขาด
${strictRulesSection}

ข้อมูลธุรกิจ:
${context || '(ยังไม่มีข้อมูลธุรกิจ)'}
${pkgContext}
${promoContext}
${imageListStr}

ประวัติการสนทนาล่าสุด:
${recentMsgs || '(ยังไม่มี)'}

ลูกค้าส่งมาว่า: "${messageText}"

ตอบเป็น JSON โดย:
- answer: คำตอบ (ใช้การขึ้นบรรทัดใหม่จริงๆ เพื่อจัดรูปแบบ)
- confidence: คะแนนความมั่นใจ 0-100 ว่าคำตอบถูกต้องตาม KB
- image_titles: ชื่อข้อมูล KB หรือชื่อ "แพ็กเกจ: ..." ที่มีรูปภาพควรส่งประกอบ (สูงสุด 3)`,
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
        .replace(/\\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 5000);
      const imageTitles = aiResponse.image_titles || [];

      // ──── Image dedup logic ────
      // Collect images from KB items and packages
      const kbRelevantImages = itemsWithImages.filter(item => imageTitles.includes(item.title));
      const pkgRelevantImages = pkgsWithImages.filter(p => imageTitles.includes(`แพ็กเกจ: ${p.name}`));
      const promoRelevantImages = promosWithImages.filter(pr => imageTitles.includes(`โปรโมชั่น: ${pr.name}`));
      const allRelevantImages = [
        ...kbRelevantImages,
        ...pkgRelevantImages.map(p => ({ title: `แพ็กเกจ: ${p.name}`, image_urls: p.image_urls })),
        ...promoRelevantImages.map(pr => ({ title: `โปรโมชั่น: ${pr.name}`, image_urls: pr.image_urls })),
      ];

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

      // Update last message for AI reply (snippet shows AI response)
      await base44.asServiceRole.entities.Customer.update(customer.id, {
        last_message_at: new Date().toISOString(),
        last_message_snippet: `🤖 ${answerText.slice(0, 60)}`,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('lineWebhook error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});