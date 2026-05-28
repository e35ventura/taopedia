/*
  Netlify Function: warm
  Purpose: Warm Netlify DPR cache for specific wiki slugs after content merges.

  Request:
    POST /api/warm (via redirects or direct function path)
    Headers: { "x-warm-secret": <WARM_SECRET> }
    Body JSON: { "slugs": ["albert_einstein", "physics/quantum_mechanics", ...] }

  Env vars:
    - WARM_SECRET (required): shared secret for auth
    - SITE_URL (optional): origin to warm, default https://taopedia.org

  Behavior:
    - Iterates slugs and fetches `${SITE_URL}/wiki/${slug}` to trigger DPR render.
*/

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const secret = process.env.WARM_SECRET;
    if (!secret) {
      return { statusCode: 500, body: 'WARM_SECRET not set' };
    }
    const got = event.headers['x-warm-secret'] || event.headers['X-Warm-Secret'];
    if (got !== secret) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    const siteUrl = process.env.SITE_URL || 'https://taopedia.org';
    const body = JSON.parse(event.body || '{}');
    const slugs = Array.isArray(body.slugs) ? body.slugs : [];
    if (slugs.length === 0) {
      return { statusCode: 400, body: 'No slugs provided' };
    }
    if (slugs.length > 25) {
      return { statusCode: 400, body: 'Too many slugs' };
    }

    const results = [];
    for (const slug of slugs) {
      if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9_/-]*$/i.test(slug)) {
        results.push({ slug, status: 'skipped', message: 'Invalid slug' });
        continue;
      }
      const url = `${siteUrl.replace(/\/$/, '')}/wiki/${slug}`;
      try {
        const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'taopedia-warm/1.0' } });
        results.push({ slug, status: res.status });
      } catch (e) {
        results.push({ slug, status: 'error', message: String(e) });
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, count: slugs.length, results }),
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${String(err)}` };
  }
};
