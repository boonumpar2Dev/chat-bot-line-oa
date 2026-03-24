import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');
    const { repo_name, description, is_private } = await req.json();

    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        name: repo_name || 'line-ai-crm',
        description: description || 'LINE AI CRM - ระบบจัดการแชทอัจฉริยะสำหรับ LINE OA',
        private: is_private ?? true,
        auto_init: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) return Response.json({ error: data.message }, { status: res.status });

    return Response.json({ ok: true, html_url: data.html_url, name: data.full_name });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});