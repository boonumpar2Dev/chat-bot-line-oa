import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // Handle CORS for LIFF
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, line_user_id, event_date } = body;

    if (!line_user_id) {
      return Response.json({ error: 'line_user_id is required' }, { status: 400, headers: CORS_HEADERS });
    }

    // For "get_customer" action, skip auth check (LIFF opens without session)
    // For all other actions, require authenticated user
    if (action !== 'get_customer') {
      const user = await base44.auth.me();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
      }
    }

    // Find customer by LINE user ID
    const customers = await base44.asServiceRole.entities.Customer.filter({ line_user_id });
    const customer = customers[0];
    if (!customer) {
      return Response.json({ error: 'Customer not found' }, { status: 404, headers: CORS_HEADERS });
    }

    // Read-only action: just return customer data
    if (action === 'get_customer') {
      return Response.json({
        ok: true,
        customer: {
          id: customer.id,
          display_name: customer.nickname || customer.display_name,
          picture_url: customer.picture_url,
          status: customer.status,
          ai_active: customer.ai_active,
          event_date: customer.event_date,
          line_user_id: customer.line_user_id,
        },
      }, { headers: CORS_HEADERS });
    }

    let updateData = {};
    let message = '';

    switch (action) {
      case 'start_job': {
        if (!event_date) {
          return Response.json({ error: 'event_date is required for start_job' }, { status: 400, headers: CORS_HEADERS });
        }
        updateData = {
          event_date,
          ai_active: false,
          status: 'pending_confirm',
        };
        message = `เริ่มงาน — วันที่จัดงาน: ${event_date} / AI ปิดอัตโนมัติ`;
        break;
      }

      case 'cancel_job': {
        updateData = {
          event_date: null,
          ai_active: true,
          status: 'new',
        };
        message = 'ยกเลิกงาน — AI เปิดกลับอัตโนมัติ';
        break;
      }

      case 'mute': {
        updateData = { ai_active: false };
        message = 'ปิด AI (Mute) สำเร็จ';
        break;
      }

      case 'unmute': {
        updateData = { ai_active: true };
        message = 'เปิด AI (Unmute) สำเร็จ';
        break;
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: CORS_HEADERS });
    }

    await base44.asServiceRole.entities.Customer.update(customer.id, updateData);

    const updated = { ...customer, ...updateData };

    return Response.json({
      ok: true,
      message,
      customer: {
        id: updated.id,
        display_name: updated.nickname || updated.display_name,
        picture_url: updated.picture_url,
        status: updated.status,
        ai_active: updated.ai_active,
        event_date: updated.event_date,
        line_user_id: updated.line_user_id,
      },
    }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('liffAdminPanel error:', err.message);
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
});