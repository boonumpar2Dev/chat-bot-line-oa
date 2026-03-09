import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const TEXT_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.html', '.xml', '.js', '.ts', '.py', '.java', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt'];

function isTextFile(filename) {
  return TEXT_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

async function fetchGithubContents(accessToken, owner, repo, path = '') {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }
  return res.json();
}

async function fetchFileContent(accessToken, downloadUrl) {
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.text();
}

async function collectFiles(accessToken, owner, repo, path, maxFiles, collected = []) {
  if (collected.length >= maxFiles) return collected;

  const items = await fetchGithubContents(accessToken, owner, repo, path);

  for (const item of items) {
    if (collected.length >= maxFiles) break;
    if (item.type === 'file' && isTextFile(item.name) && item.size < 50000) {
      collected.push(item);
    } else if (item.type === 'dir' && !item.name.startsWith('.') && item.name !== 'node_modules') {
      await collectFiles(accessToken, owner, repo, item.path, maxFiles, collected);
    }
  }
  return collected;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { owner, repo, path = '', maxFiles = 20 } = await req.json();
  if (!owner || !repo) return Response.json({ error: 'owner and repo are required' }, { status: 400 });

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

  const files = await collectFiles(accessToken, owner, repo, path, maxFiles);

  const results = [];
  for (const file of files) {
    const content = await fetchFileContent(accessToken, file.download_url);
    if (!content) continue;

    const created = await base44.asServiceRole.entities.KnowledgeBase.create({
      title: file.path,
      content: content.slice(0, 5000),
      type: 'file',
      status: 'active',
    });
    results.push({ path: file.path, id: created.id });
  }

  return Response.json({ imported: results.length, files: results });
});