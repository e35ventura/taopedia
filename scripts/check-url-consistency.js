import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Cross-feature URL consistency guard.
//
// Many independent features each emit a URL for the same page: the sitemap, the
// page's <link rel="canonical">, the search-data index, the JSON-LD graph
// (Article url + SearchAction), OpenSearch, and robots.txt. They are produced by
// separate code paths, so they drift apart easily — e.g. one keeps the trailing
// slash and another drops it (cf. the /search vs /search/ drift fixed in #97).
// Such drift silently hurts SEO (duplicate-content signals) and breaks
// consumers. This post-build check asserts they all agree.

const distDir = path.join(process.cwd(), 'dist');

function readDist(rel) {
  const file = path.join(distDir, rel);
  assert.ok(fs.existsSync(file), `dist/${rel} must exist; run npm run build first`);
  return fs.readFileSync(file, 'utf8');
}

const sitemap = readDist('sitemap.xml');
const searchData = JSON.parse(readDist('search-data.json'));

// Map each article slug -> its sitemap <loc> (the canonical absolute URL).
const sitemapUrlBySlug = new Map();
for (const match of sitemap.matchAll(/<loc>(https?:\/\/[^<]+?\/wiki\/([^<]+?)\/)<\/loc>/g)) {
  sitemapUrlBySlug.set(match[2], match[1]);
}
assert.ok(sitemapUrlBySlug.size > 0, 'sitemap must contain article <loc> URLs');
const origin = new URL([...sitemapUrlBySlug.values()][0]).origin;

// search-data emits relative URLs; resolve to absolute for comparison.
const searchUrlBySlug = new Map();
for (const entry of searchData) {
  const m = /^\/wiki\/(.+)\/$/.exec(entry.url ?? '');
  if (m) searchUrlBySlug.set(m[1], origin + entry.url);
}

// For every article, the sitemap <loc>, the page's canonical, its JSON-LD
// article url, and the search-data url must all be identical.
const drift = [];
for (const [slug, sitemapUrl] of sitemapUrlBySlug) {
  const html = readDist(`wiki/${slug}/index.html`);

  // Canonical applies to every /wiki/ page (articles and the special listings).
  const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/.exec(html)?.[1];
  if (canonical !== sitemapUrl) {
    drift.push(`${slug}: canonical "${canonical}" != sitemap "${sitemapUrl}"`);
  }

  // If the page ships JSON-LD with a /wiki/ URL, it must be the canonical one.
  const jsonLdUrl = /"url":"(https?:\/\/[^"]*\/wiki\/[^"]+?\/)"/.exec(html)?.[1];
  if (jsonLdUrl && jsonLdUrl !== sitemapUrl) {
    drift.push(`${slug}: JSON-LD url "${jsonLdUrl}" != sitemap "${sitemapUrl}"`);
  }

  // The special listing pages (/wiki/special/*) are in the sitemap but not the
  // article search index, so the search-data cross-check is article-only.
  if (slug.startsWith('special/')) continue;

  const searchUrl = searchUrlBySlug.get(slug);
  if (searchUrl === undefined) {
    drift.push(`${slug}: article is in the sitemap but missing from search-data`);
  } else if (searchUrl !== sitemapUrl) {
    drift.push(`${slug}: search-data "${searchUrl}" != sitemap "${sitemapUrl}"`);
  }
}
assert.equal(drift.length, 0, `Article URL drift across features:\n${drift.slice(0, 15).join('\n')}`);

// Every search-data article must also be in the sitemap (no orphan entries).
for (const slug of searchUrlBySlug.keys()) {
  assert.ok(sitemapUrlBySlug.has(slug), `search-data lists /wiki/${slug}/ but the sitemap does not`);
}

// The search-results URL must agree across OpenSearch and the JSON-LD
// SearchAction, and point at a real built route (the #97 drift class). The two
// use different placeholder tokens, so normalize those before comparing.
const normalizePlaceholder = (url) => url.replace(/\{[^}]+\}/, '{q}');
const opensearchTemplate = /template="([^"]+)"/.exec(readDist('opensearch.xml'))?.[1];
assert.ok(opensearchTemplate, 'opensearch.xml must define a search template URL');

const searchActionTemplate = /"urlTemplate":"([^"]+)"/.exec(readDist('index.html'))?.[1];
assert.ok(searchActionTemplate, 'homepage JSON-LD must define a SearchAction urlTemplate');

assert.equal(
  normalizePlaceholder(opensearchTemplate),
  normalizePlaceholder(searchActionTemplate),
  `OpenSearch "${opensearchTemplate}" and JSON-LD SearchAction "${searchActionTemplate}" must target the same search URL`,
);

const searchRoute = new URL(opensearchTemplate.replace(/\{[^}]+\}/, 'q')).pathname.replace(/\/$/, '');
assert.ok(
  fs.existsSync(path.join(distDir, searchRoute, 'index.html')),
  `the advertised search route ${searchRoute}/ must be a built page`,
);

// robots.txt must reference the sitemap we actually ship.
const sitemapRef = /^\s*Sitemap:\s*(\S+)/im.exec(readDist('robots.txt'))?.[1];
assert.ok(sitemapRef, 'robots.txt must reference the sitemap');
const sitemapRel = new URL(sitemapRef).pathname.replace(/^\//, '');
assert.ok(
  fs.existsSync(path.join(distDir, sitemapRel)),
  `robots.txt Sitemap reference "${sitemapRef}" must point to a built file`,
);

console.log('URL consistency check passed');
