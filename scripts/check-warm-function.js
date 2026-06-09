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
  process.env.WARM_SECRET = 'secret';
  process.env.SITE_URL = 'https://example.test';
  globalThis.fetch = fetchImpl;

  const response = await handler(eventFor(slugs));
  return {
    ...response,
    json: JSON.parse(response.body),
  };
}

try {
  let response = await callWarm(['../bad'], async () => {
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
