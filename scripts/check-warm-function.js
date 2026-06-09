import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/warm.js';

const originalSecret = process.env.WARM_SECRET;
const originalSiteUrl = process.env.SITE_URL;
const originalFetch = globalThis.fetch;

function eventFor(slugs) {
  return {
    httpMethod: 'POST',
    headers: { 'x-warm-secret': 'secret' },
    body: JSON.stringify({ slugs }),
  };
}

async function callWarm(slugs, fetchImpl) {
  const response = await startWarm(slugs, fetchImpl);
  return {
    ...response,
    json: JSON.parse(response.body),
  };
}

function startWarm(slugs, fetchImpl) {
  process.env.WARM_SECRET = 'secret';
  process.env.SITE_URL = 'https://example.test';
  globalThis.fetch = fetchImpl;

  return handler(eventFor(slugs));
}

try {
  process.env.WARM_SECRET = 'secret';
  process.env.SITE_URL = 'https://example.test';
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

  // Uppercase slugs can never match a lowercase, case-sensitive wiki route, so
  // they must be rejected as invalid rather than fetched and counted as failed.
  response = await callWarm(['Uppercase_Slug'], async () => {
    throw new Error('fetch should not be called for invalid slugs');
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
    url.endsWith('/wiki/taopedia')
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
  response = await callWarm(['taopedia'], async (_url, options) => {
    warmFetchOptions = options;
    return { status: 200, ok: true };
  });
  assert.equal(response.statusCode, 200);
  assert.ok(
    warmFetchOptions && warmFetchOptions.signal instanceof AbortSignal,
    'each warm fetch must receive an AbortSignal for the per-request timeout',
  );

  response = await handler({
    httpMethod: 'POST',
    headers: { 'x-warm-secret': 'secret' },
    body: '{',
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body, 'Invalid JSON body');
} finally {
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
  globalThis.fetch = originalFetch;
}

console.log('Warm function aggregate status check passed');
