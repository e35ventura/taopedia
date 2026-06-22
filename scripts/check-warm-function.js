import assert from 'node:assert/strict';
import { __resetRateLimitsForTests, __rateLimitStoreSizeForTests, handler } from '../netlify/functions/warm.js';

const originalSecret = process.env.WARM_SECRET;
const originalSiteUrl = process.env.SITE_URL;
const originalRateLimitMax = process.env.WARM_RATE_LIMIT_MAX;
const originalRateLimitWindow = process.env.WARM_RATE_LIMIT_WINDOW_MS;
const originalRateLimitMaxIps = process.env.WARM_RATE_LIMIT_MAX_IPS;
const originalFetch = globalThis.fetch;

function eventFor(slugs) {
  return {
    httpMethod: 'POST',
    headers: { 'x-warm-secret': 'secret' },
    body: JSON.stringify({ slugs }),
  };
}

async function callWarm(slugs, fetchImpl, siteUrl) {
  const response = await startWarm(slugs, fetchImpl, siteUrl);
  return {
    ...response,
    json: JSON.parse(response.body),
  };
}

function startWarm(slugs, fetchImpl, siteUrl = 'https://example.test') {
  process.env.WARM_SECRET = 'secret';
  process.env.SITE_URL = siteUrl;
  globalThis.fetch = fetchImpl;

  return handler(eventFor(slugs));
}

try {
  __resetRateLimitsForTests();
  process.env.WARM_SECRET = 'secret';
  process.env.SITE_URL = 'https://example.test';
  process.env.WARM_RATE_LIMIT_MAX = '1000';
  globalThis.fetch = async () => {
    throw new Error('fetch should not be called for unauthorized requests');
  };

  let response = await handler({
    httpMethod: 'POST',
    headers: { 'x-warm-secret': 'wrong' },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body, 'Unauthorized');

  response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body, 'Unauthorized');

  response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body, 'Unauthorized');

  globalThis.fetch = async () => ({ status: 200, ok: true });
  response = await handler({
    httpMethod: 'POST',
    headers: { 'X-WARM-SECRET': 'secret' },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 200);

  response = await callWarm(['../bad'], async () => {
    throw new Error('fetch should not be called for invalid slugs');
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json.ok, false);
  assert.equal(response.json.warmed, 0);
  assert.equal(response.json.failed, 0);
  assert.equal(response.json.skipped, 1);
  assert.equal(response.json.results[0].result, 'skipped');

  // Slugs that cannot match sync-articles.js validateSlug are impossible wiki
  // article routes, so they must be rejected as invalid rather than fetched and
  // counted as failed.
  response = await callWarm(['Uppercase_Slug'], async () => {
    throw new Error('fetch should not be called for invalid slugs');
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json.skipped, 1);
  assert.equal(response.json.failed, 0);
  assert.equal(response.json.results[0].result, 'skipped');

  response = await callWarm(['subnet/one'], async () => {
    throw new Error('fetch should not be called for nested slugs');
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json.skipped, 1);
  assert.equal(response.json.failed, 0);
  assert.equal(response.json.results[0].result, 'skipped');

  response = await callWarm(['missing_article'], async () => ({ status: 404, ok: false }));
  assert.equal(response.statusCode, 502);
  assert.equal(response.json.ok, false);
  assert.equal(response.json.warmed, 0);
  assert.equal(response.json.failed, 1);
  assert.equal(response.json.skipped, 0);
  assert.equal(response.json.results[0].result, 'failed');

  response = await callWarm(['taopedia', 'missing_article'], async (url) => (
    url.endsWith('/wiki/taopedia/')
      ? { status: 200, ok: true }
      : { status: 404, ok: false }
  ));
  assert.equal(response.statusCode, 207);
  assert.equal(response.json.ok, false);
  assert.equal(response.json.warmed, 1);
  assert.equal(response.json.failed, 1);
  assert.equal(response.json.skipped, 0);

  response = await callWarm(['taopedia'], async () => ({ status: 200, ok: true }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.warmed, 1);
  assert.equal(response.json.failed, 0);
  assert.equal(response.json.skipped, 0);

  const startedUrls = [];
  const pendingFetches = [];
  const parallelWarm = startWarm(['taopedia', 'alpha_tokens', 'dynamic_tao'], async (url) => {
    startedUrls.push(url);
    return new Promise((resolve) => {
      pendingFetches.push(() => resolve({ status: 200, ok: true }));
    });
  });
  await Promise.resolve();
  assert.equal(startedUrls.length, 3);
  for (const resolveFetch of pendingFetches) {
    resolveFetch();
  }
  const parallelResponse = await parallelWarm;
  response = {
    ...parallelResponse,
    json: JSON.parse(parallelResponse.body),
  };
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.warmed, 3);
  assert.equal(response.json.failed, 0);
  assert.equal(response.json.skipped, 0);

  // A fetch that rejects (e.g. the per-request timeout aborts a slow page) is
  // recorded as a failed slug, not propagated as a 500.
  response = await callWarm(['taopedia'], async () => {
    throw new Error('simulated timeout/abort');
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json.warmed, 0);
  assert.equal(response.json.failed, 1);
  assert.equal(response.json.results[0].result, 'failed');

  // Each warm request is given an abort signal so a slow page can't stall the batch.
  let warmFetchOptions;
  let warmFetchUrl;
  response = await callWarm(['taopedia'], async (url, options) => {
    warmFetchUrl = url;
    warmFetchOptions = options;
    return { status: 200, ok: true };
  });
  assert.equal(response.statusCode, 200);
  assert.equal(warmFetchUrl, 'https://example.test/wiki/taopedia/', 'warm fetch should use canonical article URL');
  assert.ok(
    warmFetchOptions && warmFetchOptions.signal instanceof AbortSignal,
    'each warm fetch must receive an AbortSignal for the per-request timeout',
  );

  response = await callWarm(['taopedia'], async (url) => {
    warmFetchUrl = url;
    return { status: 200, ok: true };
  }, 'https://example.test//');
  assert.equal(response.statusCode, 200);
  assert.equal(
    warmFetchUrl,
    'https://example.test/wiki/taopedia/',
    'warm fetch should normalize repeated trailing slashes on SITE_URL',
  );

  response = await callWarm(['taopedia'], async (url) => {
    warmFetchUrl = url;
    return { status: 200, ok: true };
  }, 'https://example.test/deploy-preview/');
  assert.equal(response.statusCode, 200);
  assert.equal(
    warmFetchUrl,
    'https://example.test/wiki/taopedia/',
    'warm fetch should use the SITE_URL origin instead of appending to an accidental path',
  );

  response = await callWarm(['taopedia'], async (url) => {
    warmFetchUrl = url;
    return { status: 200, ok: true };
  }, '   ');
  assert.equal(response.statusCode, 200);
  assert.equal(
    warmFetchUrl,
    'https://taopedia.org/wiki/taopedia/',
    'warm fetch should fall back to the default origin when SITE_URL is blank',
  );

  response = await handler({
    httpMethod: 'POST',
    headers: { 'x-warm-secret': 'secret' },
    body: '{',
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body, 'Invalid JSON body');

  __resetRateLimitsForTests();
  process.env.WARM_RATE_LIMIT_MAX = '2';
  process.env.WARM_RATE_LIMIT_WINDOW_MS = '60000';
  globalThis.fetch = async () => ({ status: 200, ok: true });

  const rateLimitedEvent = {
    httpMethod: 'POST',
    headers: {
      'x-warm-secret': 'secret',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  };

  response = await handler(rateLimitedEvent);
  assert.equal(response.statusCode, 200, 'first request within rate limit should succeed');

  response = await handler(rateLimitedEvent);
  assert.equal(response.statusCode, 200, 'second request within rate limit should succeed');

  response = await handler(rateLimitedEvent);
  assert.equal(response.statusCode, 429);
  assert.equal(response.body, 'Too Many Requests');
  assert.equal(response.headers['retry-after'], '60');

  __resetRateLimitsForTests();
  process.env.WARM_RATE_LIMIT_MAX = '1';
  response = await handler({
    httpMethod: 'POST',
    headers: {
      'x-warm-secret': 'wrong',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 401, 'bad secrets should fail auth without consuming the valid warm bucket');
  response = await handler(rateLimitedEvent);
  assert.equal(response.statusCode, 200, 'a valid warm from the same IP should still succeed after a bad-secret attempt');
  response = await handler({
    httpMethod: 'POST',
    headers: {
      'x-warm-secret': 'wrong',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 429, 'bad-secret attempts should still have their own rate limit');
  process.env.WARM_RATE_LIMIT_MAX = '2';

  response = await handler({
    httpMethod: 'POST',
    headers: {
      'x-warm-secret': 'secret',
      'x-forwarded-for': '203.0.113.11',
    },
    body: JSON.stringify({ slugs: ['taopedia'] }),
  });
  assert.equal(response.statusCode, 200, 'rate limits should be tracked per client IP');

  // The platform-set connection IP takes precedence over a client-supplied
  // X-Forwarded-For, so forging XFF cannot let an attacker escape their bucket.
  __resetRateLimitsForTests();
  const nfHeaders = (xff) => ({
    'x-warm-secret': 'secret',
    'x-nf-client-connection-ip': '198.51.100.7',
    'x-forwarded-for': xff,
  });
  response = await handler({ httpMethod: 'POST', headers: nfHeaders('203.0.113.20'), body: JSON.stringify({ slugs: ['taopedia'] }) });
  assert.equal(response.statusCode, 200, 'first request from the connection IP succeeds');
  response = await handler({ httpMethod: 'POST', headers: nfHeaders('203.0.113.21'), body: JSON.stringify({ slugs: ['taopedia'] }) });
  assert.equal(response.statusCode, 200, 'second request, same connection IP but different XFF, still within limit');
  response = await handler({ httpMethod: 'POST', headers: nfHeaders('203.0.113.22'), body: JSON.stringify({ slugs: ['taopedia'] }) });
  assert.equal(response.statusCode, 429, 'forging X-Forwarded-For cannot escape the connection-IP rate-limit bucket');

  // The bucket store must stay hard-bounded under a flood of distinct, unauthenticated,
  // client-controlled IPs (spoofed X-Forwarded-For, no trusted Netlify header) — it
  // cannot grow without bound. With the cap at 50, 500 distinct IPs must not exceed it.
  __resetRateLimitsForTests();
  process.env.WARM_RATE_LIMIT_MAX_IPS = '50';
  process.env.WARM_RATE_LIMIT_MAX = '1';
  for (let i = 0; i < 500; i += 1) {
    await handler({
      httpMethod: 'POST',
      headers: { 'x-forwarded-for': `198.51.100.${i}` },
      body: JSON.stringify({ slugs: ['taopedia'] }),
    });
  }
  assert.ok(
    __rateLimitStoreSizeForTests() <= 50,
    `rate-limit store must stay bounded under many distinct unauthenticated IPs (got ${__rateLimitStoreSizeForTests()})`,
  );

  __resetRateLimitsForTests();
  process.env.WARM_RATE_LIMIT_MAX_IPS = '50';
  process.env.WARM_RATE_LIMIT_MAX = '1000';
  for (let i = 0; i < 75; i += 1) {
    await handler({
      httpMethod: 'POST',
      headers: {
        'x-warm-secret': 'wrong',
        'x-forwarded-for': `203.0.113.${i}`,
      },
      body: JSON.stringify({ slugs: ['taopedia'] }),
    });
  }
  for (let i = 0; i < 75; i += 1) {
    await handler({
      httpMethod: 'POST',
      headers: {
        'x-warm-secret': 'secret',
        'x-forwarded-for': `198.51.100.${i}`,
      },
      body: JSON.stringify({ slugs: ['taopedia'] }),
    });
  }
  assert.ok(
    __rateLimitStoreSizeForTests() <= 50,
    `combined warm/auth rate-limit buckets must stay bounded under mixed traffic (got ${__rateLimitStoreSizeForTests()})`,
  );
} finally {
  __resetRateLimitsForTests();
  if (originalSecret === undefined) {
    delete process.env.WARM_SECRET;
  } else {
    process.env.WARM_SECRET = originalSecret;
  }
  if (originalSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalSiteUrl;
  }
  if (originalRateLimitMax === undefined) {
    delete process.env.WARM_RATE_LIMIT_MAX;
  } else {
    process.env.WARM_RATE_LIMIT_MAX = originalRateLimitMax;
  }
  if (originalRateLimitWindow === undefined) {
    delete process.env.WARM_RATE_LIMIT_WINDOW_MS;
  } else {
    process.env.WARM_RATE_LIMIT_WINDOW_MS = originalRateLimitWindow;
  }
  if (originalRateLimitMaxIps === undefined) {
    delete process.env.WARM_RATE_LIMIT_MAX_IPS;
  } else {
    process.env.WARM_RATE_LIMIT_MAX_IPS = originalRateLimitMaxIps;
  }
  globalThis.fetch = originalFetch;
}

console.log('Warm function aggregate status check passed');
