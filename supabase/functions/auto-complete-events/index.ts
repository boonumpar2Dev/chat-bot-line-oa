// Auto-complete events: ปิดงานลูกค้าที่ event_date ผ่านไปแล้ว
// รันทุกวัน 00:05 Bangkok time (= 17:05 UTC วันก่อนหน้า)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function bangkokTodayIso(): string {
  // Bangkok = UTC+7. ใช้ now+7h แล้ว slice เป็น YYYY-MM-DD
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const todayIso = bangkokTodayIso();

    const { data: rows, error } = await supabase
      .from("customers")
      .select("id, status, event_type, event_date, guest_count, venue, conversation_summary")
      .in("status", ["confirmed", "confirmed_returning"])
      .not("event_date", "is", null)
      .lt("event_date", todayIso);

    if (error) {
      console.error("[auto-complete] query error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let count = 0;
    for (const c of rows || []) {
      const parts: string[] = [];
      if (c.event_type) parts.push(String(c.event_type));
      if (c.event_date) parts.push(`วันที่ ${c.event_date}`);
      if (c.guest_count) parts.push(`จำนวน ${c.guest_count} คน`);
      if (c.venue) parts.push(`ที่ ${c.venue}`);
      const historyLine = parts.length > 0 ? `\n\n📋 ประวัติจัดงาน: ${parts.join(" ")}` : "";
      const newSummary = (c.conversation_summary || "") + historyLine;

      const { error: upErr } = await supabase
        .from("customers")
        .update({
          status: "completed",
          ai_active: true,
          conversation_summary: newSummary,
        })
        .eq("id", c.id);

      if (upErr) {
        console.error(`[auto-complete] update failed ${c.id}:`, upErr);
        continue;
      }
      count++;
    }

    console.log(`Auto-completed ${count} customers`);
    return new Response(JSON.stringify({ ok: true, completed: count, date: todayIso }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-complete] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
