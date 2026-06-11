/*
  Netlify Function: warm
  Purpose: Warm Netlify DPR cache for specific wiki slugs after content merges.

  Request:
    POST /api/warm (via redirects or direct function path)
    Headers: { "x-warm-secret": <WARM_SECRET> }
    Body JSON: { "slugs": ["taopedia", "alpha_tokens", ...] }

  Env vars:
    - WARM_SECRET (required): shared secret for auth
    - SITE_URL (optional): origin to warm, default https://taopedia.org
    - WARM_RATE_LIMIT_MAX (optional): max requests per IP per window, default 12
    - WARM_RATE_LIMIT_WINDOW_MS (optional): rate-limit window in ms, default 60000

  Behavior:
    - Fetches `${SITE_URL}/wiki/${slug}/` to trigger DPR render for each slug.
*/

import { createHash, timingSafeEqual } from 'node:crypto';

// Bound each warm request so one slow or unresponsive page can't stall the whole
// Promise.all batch up to the Netlify function's execution budget. A request that
// exceeds this is aborted and recorded as a failed slug; the rest still return.
const WARM_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_RATE_LIMIT_MAX = 12;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

// Per-instance sliding window keyed by client IP. Limits blast radius if WARM_SECRET
// leaks or an attacker hammers the endpoint with bad credentials.
const rateLimitBuckets = new Map();

function secretDigest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

function secretsMatch(received, expected) {
  return timingSafeEqual(secretDigest(received), secretDigest(expected));
}

function getHeader(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return '';
}

function normalizeSiteOrigin(value) {
  const raw = String(value ?? '').trim() || 'https://taopedia.org';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRateLimitConfig() {
  return {
    max: parsePositiveInt(process.env.WARM_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    windowMs: parsePositiveInt(process.env.WARM_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  };
}

function getClientIp(event) {
  const forwarded = getHeader(event.headers, 'x-forwarded-for');
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const clientIp = getHeader(event.headers, 'client-ip');
  if (clientIp) return String(clientIp).trim();
  return 'unknown';
}

function pruneExpiredBuckets(now) {
  if (rateLimitBuckets.size <= 1000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (now >= bucket.resetAt) {
      rateLimitBuckets.delete(key);
    }
  }
}

function checkRateLimit(ip) {
  const { max, windowMs } = getRateLimitConfig();
  const now = Date.now();
  pruneExpiredBuckets(now);

  let bucket = rateLimitBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateLimitBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= max;
  const retryAfterSec = allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000);
  return { allowed, retryAfterSec };
}

export function __resetRateLimitsForTests() {
  rateLimitBuckets.clear();
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const rateLimit = checkRateLimit(getClientIp(event));
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          'content-type': 'text/plain',
          'retry-after': String(rateLimit.retryAfterSec),
        },
        body: 'Too Many Requests',
      };
    }

    const secret = process.env.WARM_SECRET;
    if (!secret) {
      return { statusCode: 500, body: 'WARM_SECRET not set' };
    }
    const got = getHeader(event.headers, 'x-warm-secret');
    if (!secretsMatch(got, secret)) {
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

    const baseUrl = normalizeSiteOrigin(siteUrl);
    const warmSlug = async (slug) => {
      // Article slugs are flat, lowercase strings (see sync-articles.js
      // validateSlug), and wiki routes are case-sensitive. Reject impossible
      // route inputs instead of fetching guaranteed 404s and counting them as
      // warm failures.
      if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
        return { slug, status: 'skipped', result: 'skipped', message: 'Invalid slug' };
      }
      const url = `${baseUrl}/wiki/${slug}/`;
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
