import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const allowed = (roles || []).some((r: any) => ['owner', 'admin', 'manager'].includes(r.role));
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages : [];
    const auditId: string | undefined = body.audit_id;

    // Load current rules + categories + active packages
    const [{ data: settings }, { data: cats }, { data: pkgs }] = await Promise.all([
      admin.from('app_settings').select('strict_rules, intent_fields').eq('key', 'ai_config').maybeSingle(),
      admin.from('package_categories').select('name'),
      admin.from('catering_packages').select('id, name, category, is_active').eq('is_active', true),
    ]);
    const rules: string[] = settings?.strict_rules || [];

    let auditCtx = '';
    if (auditId) {
      const { data: a } = await admin.from('ai_reply_audit').select('*').eq('id', auditId).maybeSingle();
      if (a) {
        auditCtx = `\n\n=== เคสที่กำลังวิเคราะห์ ===
เวลา: ${a.created_at}
ลูกค้าถาม: ${a.customer_message || '-'}
AI ตอบ: ${a.ai_reply || '-'}
Image titles ที่ส่ง: ${JSON.stringify(a.image_titles || [])}
Intent ที่เก็บได้: ${JSON.stringify(a.intent_extracted || {})}
Confidence: ${a.confidence ?? '-'}%
Latency: ${a.latency_ms ?? '-'}ms
บริบทก่อนหน้า:
${a.recent_context || '-'}

แพ็กเกจที่ vector search ดึงมาให้ AI เห็น (${(a.packages_retrieved || []).length} แพ็ก):
${JSON.stringify(a.packages_retrieved || [], null, 2)}

KB ที่ดึงมา (${(a.knowledge_retrieved || []).length} ชิ้น):
${JSON.stringify(a.knowledge_retrieved || [], null, 2)}
`;
      }
    }

    const systemMsg = `คุณคือ "AI Coach" ผู้ช่วยปรับปรุงกฎและพรอมพ์ของ AI แชทบอทขายงานจัดเลี้ยง (บุญนำพา)
หน้าที่: วิเคราะห์ว่าทำไม AI ตอบแบบนั้น แล้วเสนอแก้กฎ/พรอมพ์ให้ดีขึ้น

ข้อมูลปัจจุบันของระบบ:
- หมวดแพ็กเกจ: ${(cats || []).map((c: any) => c.name).join(', ')}
- แพ็กเกจที่ active: ${(pkgs || []).map((p: any) => `${p.name} [${p.category}]`).join(', ')}
- กฎ AI ที่ใช้อยู่ (${rules.length} ข้อ):
${rules.map((r, i) => `[${i}] ${r}`).join('\n')}
${auditCtx}

วิธีตอบ:
1. วิเคราะห์ปัญหา (สั้น กระชับ)
2. ถ้าจะเสนอแก้กฎ ให้แนบ JSON block ปิดด้วย \`\`\`json ... \`\`\` รูปแบบนี้:
{
  "summary": "สรุปการเปลี่ยนแปลง 1 บรรทัด",
  "add_rules": ["กฎใหม่ข้อที่ 1", "..."],
  "remove_rule_indexes": [0, 3],
  "replace_rules": [{"index": 2, "new": "ข้อความใหม่"}]
}
ใส่เฉพาะ field ที่เกี่ยวข้อง ไม่ต้องใส่ทั้งหมด ถ้าไม่ต้องเปลี่ยนกฎก็ไม่ต้องใส่ block
3. ตอบเป็นภาษาไทย กระชับ ตรงประเด็น
4. กฎต้องสั้น บังคับพฤติกรรม ไม่ใช่ข้อมูล (ถ้าเป็นข้อมูล → แนะนำให้ใส่ใน Knowledge Base แทน)`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'system', content: systemMsg }, ...messages],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `AI gateway ${resp.status}: ${t}` }, 500);
    }
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || '';

    let proposed: any = null;
    const m = reply.match(/```json\s*([\s\S]*?)\s*```/);
    if (m) {
      try { proposed = JSON.parse(m[1]); } catch { /* ignore */ }
    }

    return json({ reply, proposed, current_rules: rules });
  } catch (e: any) {
    console.error('[ai-coach-chat]', e);
    return json({ error: e.message || String(e) }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
