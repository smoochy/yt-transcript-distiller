const GITHUB_API = 'https://api.github.com';

export async function exportToGitHub({ pat, repo, subfolder, format, videoId, title, url, date, provider, model, summary, transcript }) {
  const errors = [];
  const subfolder_ = subfolder || 'yt-summaries';
  const folder = subfolder_.endsWith('/') ? subfolder_ : `${subfolder_}/`;

  if (format === 'markdown' || format === 'both') {
    try {
      await pushFile({
        pat, repo,
        path: `${folder}${videoId}_${date}.md`,
        content: buildMarkdown({ title, url, date, provider, model, summary, transcript }),
      });
    } catch (e) {
      errors.push(`MD: ${e.message}`);
    }
  }

  if (format === 'json' || format === 'both') {
    try {
      await pushFile({
        pat, repo,
        path: `${folder}${videoId}_${date}.json`,
        content: JSON.stringify({ video_id: videoId, title, url, date, provider, model, summary, transcript }, null, 2),
      });
    } catch (e) {
      errors.push(`JSON: ${e.message}`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('; '));
}

async function pushFile({ pat, repo, path, content }) {
  const apiUrl = `${GITHUB_API}/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const getRes = await fetch(apiUrl, { headers });
  let sha;
  if (getRes.ok) {
    sha = (await getRes.json()).sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub GET failed: HTTP ${getRes.status}`);
  }

  // UTF-8 safe base64: loop avoids spread stack overflow on large transcripts
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary);

  const body = { message: `Add ${path.split('/').pop()}`, content: encoded };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err?.message || `GitHub PUT failed: HTTP ${putRes.status}`);
  }
}

function buildMarkdown({ title, url, date, provider, model, summary, transcript }) {
  return [
    `# ${title}`,
    `**URL:** ${url}`,
    `**Datum:** ${date}`,
    `**Modell:** ${provider}/${model}`,
    '',
    '## Zusammenfassung',
    summary,
    '',
    '## Transkript',
    transcript,
    '',
  ].join('\n');
}
