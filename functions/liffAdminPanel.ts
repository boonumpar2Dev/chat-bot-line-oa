import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  // Handle CORS for LIFF
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, line_user_id, event_date } = await req.json();

    if (!line_user_id) {
      return Response.json({ error: 'line_user_id is required' }, { status: 400 });
    }

    // Find customer by LINE user ID
    const customers = await base44.asServiceRole.entities.Customer.filter({ line_user_id });
    const customer = customers[0];
    if (!customer) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    let updateData = {};
    let message = '';

    switch (action) {
      case 'start_job': {
        // เริ่มงาน/จอง → บันทึกวันที่ + Mute AI + เปลี่ยนสเตตัส
        if (!event_date) {
          return Response.json({ error: 'event_date is required for start_job' }, { status: 400 });
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
        // ยกเลิกงาน → ล้างวันที่ + Unmute AI + กลับสถานะ
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
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await base44.asServiceRole.entities.Customer.update(customer.id, updateData);

    // Return updated customer state
    const updated = { ...customer, ...updateData };

    return Response.json({
      ok: true,
      message,
      customer: {
        id: updated.id,
        display_name: updated.nickname || updated.display_name,
        status: updated.status,
        ai_active: updated.ai_active,
        event_date: updated.event_date,
      },
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('liffAdminPanel error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});