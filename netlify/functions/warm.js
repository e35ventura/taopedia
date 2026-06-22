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
// Hard ceiling on distinct client buckets tracked at once, so the store cannot grow
// without bound when the spoofable X-Forwarded-For fallback is used (i.e. the trusted
// x-nf-client-connection-ip header is absent). Override with WARM_RATE_LIMIT_MAX_IPS.
const DEFAULT_RATE_LIMIT_MAX_IPS = 5000;

// Per-instance fixed-window counter keyed by request class + client IP. This keeps
// successful warms and failed-auth attempts isolated while preserving one shared
// maxIps ceiling for the total in-memory store.
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
    maxIps: parsePositiveInt(process.env.WARM_RATE_LIMIT_MAX_IPS, DEFAULT_RATE_LIMIT_MAX_IPS),
  };
}

function getClientIp(event) {
  // Prefer Netlify's platform-set connection IP, which reflects the real TCP peer
  // and cannot be spoofed by a client header. Only fall back to the client-supplied
  // X-Forwarded-For chain (first hop) when it is absent, so an attacker cannot
  // sidestep their own bucket by forging XFF.
  const connectionIp = getHeader(event.headers, 'x-nf-client-connection-ip');
  if (connectionIp) return String(connectionIp).trim();
  const forwarded = getHeader(event.headers, 'x-forwarded-for');
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const clientIp = getHeader(event.headers, 'client-ip');
  if (clientIp) return String(clientIp).trim();
  return 'unknown';
}

// Keep the bucket store hard-bounded at `maxIps` entries so a flood of distinct,
// client-controlled IP keys cannot grow memory without bound. Reclaim expired
// buckets first (they carry no live state); if still over the ceiling, evict the
// oldest-inserted buckets (Map preserves insertion order). Eviction only grants
// that IP a fresh window — the WARM_SECRET gate remains the primary control.
function bucketKey(kind, ip) {
  return `${kind}:${ip}`;
}

function enforceBucketCap(now, maxIps) {
  pruneExpiredBuckets(rateLimitBuckets, now);
  while (rateLimitBuckets.size > maxIps) {
    const oldest = rateLimitBuckets.keys().next().value;
    if (!oldest) break;
    rateLimitBuckets.delete(oldest);
  }
}

function pruneExpiredBuckets(store, now) {
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key);
  }
}

function checkRateLimit(kind, ip) {
  const { max, windowMs, maxIps } = getRateLimitConfig();
  const now = Date.now();
  const key = bucketKey(kind, ip);

  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    // Re-insert so a refreshed key moves to the end of the Map's insertion order,
    // making eviction least-recently-active first.
    rateLimitBuckets.delete(key);
    rateLimitBuckets.set(key, bucket);
    enforceBucketCap(now, maxIps);
  }

  bucket.count += 1;
  const allowed = bucket.count <= max;
  const retryAfterSec = allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000);
  return { allowed, retryAfterSec };
}

export function __resetRateLimitsForTests() {
  rateLimitBuckets.clear();
}

export function __rateLimitStoreSizeForTests() {
  return rateLimitBuckets.size;
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const clientIp = getClientIp(event);

    const secret = process.env.WARM_SECRET;
    if (!secret) {
      return { statusCode: 500, body: 'WARM_SECRET not set' };
    }
    const got = getHeader(event.headers, 'x-warm-secret');
    if (!secretsMatch(got, secret)) {
      const authRateLimit = checkRateLimit('auth', clientIp);
      if (!authRateLimit.allowed) {
        return {
          statusCode: 429,
          headers: {
            'content-type': 'text/plain',
            'retry-after': String(authRateLimit.retryAfterSec),
          },
          body: 'Too Many Requests',
        };
      }
      return { statusCode: 401, body: 'Unauthorized' };
    }

    const rateLimit = checkRateLimit('warm', clientIp);
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
