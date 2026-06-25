import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireStaffOrService } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const __auth = await requireStaffOrService(req);
  if (!__auth.ok) return Response.json({ error: __auth.error }, { status: __auth.status || 401, headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, line_user_id, event_date } = await req.json();
    if (!line_user_id) return Response.json({ error: "line_user_id required" }, { status: 400, headers: corsHeaders });

    const { data: custArr } = await admin.from("customers").select("*").eq("line_user_id", line_user_id).limit(1);
    const customer = custArr?.[0];
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });

    const summarize = (c: any) => ({
      id: c.id,
      display_name: c.nickname || c.display_name,
      picture_url: c.picture_url,
      status: c.status,
      ai_active: c.ai_active,
      event_date: c.event_date,
      line_user_id: c.line_user_id,
      manual_chat_until: c.manual_chat_until,
    });

    if (action === "get_customer") {
      return Response.json({ ok: true, customer: summarize(customer) }, { headers: corsHeaders });
    }

    let updateData: any = {};
    let message = "";
    switch (action) {
      case "start_job":
        if (!event_date) return Response.json({ error: "event_date required" }, { status: 400, headers: corsHeaders });
        updateData = { event_date, ai_active: false, status: "pending_confirm" };
        message = `เริ่มงาน — วันที่จัดงาน: ${event_date} / AI ปิดอัตโนมัติ`;
        break;
      case "cancel_job":
        updateData = { event_date: null, ai_active: true, status: "new" };
        message = "ยกเลิกงาน — AI เปิดกลับอัตโนมัติ";
        break;
      case "mute":
        updateData = { ai_active: false };
        message = "ปิด AI สำเร็จ";
        break;
      case "unmute":
      case "resume_bot":
        updateData = { ai_active: true, manual_chat_until: null, ai_resumed_at: new Date().toISOString() };
        message = "เปิด AI สำเร็จ";
        break;
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
    }

    await admin.from("customers").update(updateData).eq("id", customer.id);
    return Response.json({ ok: true, message, customer: summarize({ ...customer, ...updateData }) }, { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
