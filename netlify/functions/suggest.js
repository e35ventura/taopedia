// OpenSearch Suggestions endpoint (served at /suggest?q=, routed by netlify.toml).
// Completes the OpenSearch integration advertised by /opensearch.xml (#88): when a
// user adds Taopedia as a browser search engine, the address bar queries this
// endpoint for autocomplete and gets back matching article titles + direct URLs.
//
// Returns the OpenSearch Suggestions JSON format:
//   [ query, [completions], [descriptions], [query URLs] ]
// Like warm.js, it reads the site's own already-built data over HTTP (the small
// /search-data.json index) and is bounded by a request timeout.

const SEARCH_DATA_TIMEOUT_MS = 2500;
const MAX_SUGGESTIONS = 10;

function normalizeSiteOrigin(value) {
  const raw = String(value ?? '').trim() || 'https://taopedia.org';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

// Build the OpenSearch Suggestions array from the search index. Pure (no I/O) so
// it can be unit tested directly. Prefix matches rank ahead of other substring
// matches; the index is already title-sorted, so ties keep alphabetical order.
export function buildSuggestions(query, entries, { origin = '', limit = MAX_SUGGESTIONS } = {}) {
  const q = String(query ?? '').trim();
  const completions = [];
  const descriptions = [];
  const urls = [];

  if (q && Array.isArray(entries)) {
    const needle = q.toLowerCase();
    const prefix = [];
    const other = [];
    for (const entry of entries) {
      const title = String(entry?.title ?? '');
      if (!title) continue;
      const lower = title.toLowerCase();
      if (lower.startsWith(needle)) prefix.push(entry);
      else if (lower.includes(needle)) other.push(entry);
    }
    for (const entry of [...prefix, ...other].slice(0, limit)) {
      completions.push(String(entry.title));
      descriptions.push(String(entry.summary ?? ''));
      const path = String(entry.url ?? '');
      urls.push(origin && path.startsWith('/') ? `${origin}${path}` : path);
    }
  }

  return [q, completions, descriptions, urls];
}

// Cache the index across warm invocations of the same container so repeated
// keystrokes don't re-fetch it.
let cachedEntries = null;

async function loadEntries(origin) {
  if (cachedEntries) return cachedEntries;
  const res = await fetch(`${origin}/search-data.json`, {
    method: 'GET',
    headers: { 'User-Agent': 'taopedia-suggest/1.0' },
    signal: AbortSignal.timeout(SEARCH_DATA_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = await res.json();
  cachedEntries = Array.isArray(data) ? data : [];
  return cachedEntries;
}

export const handler = async (event) => {
  if (event?.httpMethod && event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const query = event?.queryStringParameters?.q ?? '';
  const origin = normalizeSiteOrigin(process.env.SITE_URL);

  let entries = [];
  try {
    entries = await loadEntries(origin);
  } catch {
    // A slow or failed index fetch degrades to an empty suggestion list rather
    // than erroring the browser's autocomplete request.
    entries = [];
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/x-suggestions+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(buildSuggestions(query, entries, { origin })),
  };
};
