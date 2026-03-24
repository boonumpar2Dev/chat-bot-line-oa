import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Scheduled automation — no user session, use service role directly
    const allCustomers = await base44.asServiceRole.entities.Customer.filter({});
    const now = new Date();
    let expired = 0;

    for (const customer of allCustomers) {
      if (customer.manual_chat_until && new Date(customer.manual_chat_until) <= now) {
        // Timer expired — resume AI
        await base44.asServiceRole.entities.Customer.update(customer.id, {
          ai_active: true,
          manual_chat_until: null,
        });
        expired++;
        console.log(`[ExpireTimer] Resumed AI for ${customer.line_user_id}`);
      }
    }

    return Response.json({ ok: true, expired_count: expired });
  } catch (err) {
    console.error('expireManualChat error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});