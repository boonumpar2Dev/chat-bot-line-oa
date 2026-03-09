import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { line_user_id, message, messages } = await req.json();
    if (!line_user_id) {
      return Response.json({ error: 'Missing line_user_id' }, { status: 400 });
    }

    // Support both single message and array of message objects
    let lineMessages = messages;
    if (!lineMessages && message) {
      lineMessages = [{ type: 'text', text: message }];
    }
    if (!lineMessages) {
      return Response.json({ error: 'Missing message or messages' }, { status: 400 });
    }

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`,
      },
      body: JSON.stringify({
        to: line_user_id,
        messages: lineMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('LINE push error:', JSON.stringify(err));
      return Response.json({ error: err }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});