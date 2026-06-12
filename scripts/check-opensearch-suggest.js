import assert from 'node:assert/strict';
import { buildSuggestions, handler } from '../netlify/functions/suggest.js';

const origin = 'https://taopedia.org';
const entries = [
  { title: 'Alpha Stake', summary: 'a', url: '/wiki/alpha_stake/' },
  { title: 'Stake', summary: 'stake def', url: '/wiki/stake/' },
  { title: 'Stake Weight', summary: 'sw', url: '/wiki/stake_weight/' },
  { title: 'TAO', summary: 'token', url: '/wiki/tao/' },
];

// --- buildSuggestions (pure) ---

// OpenSearch Suggestions shape: [query, completions, descriptions, urls].
const weight = buildSuggestions('weight', entries, { origin });
assert.equal(weight[0], 'weight', 'element 0 echoes the query');
assert.deepEqual(weight[1], ['Stake Weight'], 'completions are the matching titles');
assert.deepEqual(weight[2], ['sw'], 'descriptions are the matching summaries');
assert.deepEqual(
  weight[3],
  ['https://taopedia.org/wiki/stake_weight/'],
  'urls are absolute canonical article URLs',
);

// Prefix matches rank ahead of mid-string matches (even when alphabetically later).
const stakeQ = buildSuggestions('stake', entries, { origin });
assert.deepEqual(
  stakeQ[1],
  ['Stake', 'Stake Weight', 'Alpha Stake'],
  'prefix matches come before substring matches',
);

// Empty/whitespace query returns empty suggestion arrays, not all entries.
assert.deepEqual(buildSuggestions('', entries, { origin }), ['', [], [], []], 'empty query suggests nothing');
assert.deepEqual(buildSuggestions('   ', entries, { origin })[1], [], 'whitespace query suggests nothing');

// No match returns empty completions.
assert.deepEqual(buildSuggestions('zzz', entries, { origin })[1], [], 'no match returns no completions');

// limit caps the number of suggestions.
assert.equal(buildSuggestions('a', entries, { origin, limit: 1 })[1].length, 1, 'limit caps suggestions');

// Robust to malformed entries (missing title/url).
assert.doesNotThrow(() => buildSuggestions('s', [{ summary: 'x' }, null, { title: 'Stake' }], { origin }));

// --- handler (end-to-end, with a mocked search-data fetch) ---

const originalFetch = globalThis.fetch;
const originalSiteUrl = process.env.SITE_URL;
process.env.SITE_URL = origin;
let fetchedUrl = null;
globalThis.fetch = async (url) => {
  fetchedUrl = String(url);
  return { ok: true, json: async () => entries };
};

try {
  const res = await handler({ httpMethod: 'GET', queryStringParameters: { q: 'stake' } });
  assert.equal(res.statusCode, 200, 'handler returns 200');
  assert.match(res.headers['Content-Type'], /application\/x-suggestions\+json/, 'declares the suggestions content type');
  assert.equal(fetchedUrl, 'https://taopedia.org/search-data.json', 'handler reads the built search index');
  const body = JSON.parse(res.body);
  assert.equal(body[0], 'stake', 'response echoes the query');
  assert.deepEqual(body[1], ['Stake', 'Stake Weight', 'Alpha Stake'], 'response lists matching titles, prefix-first');

  // Non-GET is rejected (the browser autocomplete uses GET).
  const post = await handler({ httpMethod: 'POST', queryStringParameters: { q: 'x' } });
  assert.equal(post.statusCode, 405, 'non-GET methods are rejected');
} finally {
  globalThis.fetch = originalFetch;
  if (originalSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = originalSiteUrl;
}

console.log('check-opensearch-suggest: all assertions passed');
