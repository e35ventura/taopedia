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
    - Fetches `${SITE_URL}/wiki/${slug}` to trigger DPR render for each slug.
*/

// Bound each warm request so one slow or unresponsive page can't stall the whole
// Promise.all batch up to the Netlify function's execution budget. A request that
// exceeds this is aborted and recorded as a failed slug; the rest still return.
const WARM_FETCH_TIMEOUT_MS = 8000;

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
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: 'Invalid JSON body' };
    }
    const slugs = Array.isArray(body.slugs) ? body.slugs : [];
    if (slugs.length === 0) {
      return { statusCode: 400, body: 'No slugs provided' };
    }
    if (slugs.length > 25) {
      return { statusCode: 400, body: 'Too many slugs' };
    }

    const baseUrl = siteUrl.replace(/\/$/, '');
    const warmSlug = async (slug) => {
      // Article slugs are lowercase (see sync-articles.js validateSlug), and wiki
      // routes are case-sensitive, so an uppercase slug can never warm a real
      // page. Reject it as an invalid (skipped) slug instead of fetching a URL
      // that is guaranteed to 404 and be counted as a failure.
      if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9_/-]*$/.test(slug)) {
        return { slug, status: 'skipped', result: 'skipped', message: 'Invalid slug' };
      }
      const url = `${baseUrl}/wiki/${slug}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'taopedia-warm/1.0' },
          signal: AbortSignal.timeout(WARM_FETCH_TIMEOUT_MS),
        });
        return {
          slug,
          status: res.status,
          result: res.ok ? 'warmed' : 'failed',
        };
      } catch (e) {
        return { slug, status: 'error', result: 'failed', message: String(e) };
      }
    };

    const results = await Promise.all(slugs.map(warmSlug));

    const summary = results.reduce(
      (counts, result) => {
        counts[result.result] += 1;
        return counts;
      },
      { warmed: 0, failed: 0, skipped: 0 },
    );
    const ok = summary.warmed === slugs.length;
    const statusCode = ok
      ? 200
      : summary.warmed > 0
        ? 207
        : summary.failed > 0
          ? 502
          : 400;

    return {
      statusCode,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok, count: slugs.length, ...summary, results }),
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${String(err)}` };
  }
};
