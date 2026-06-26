import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from './frontmatter.js';
import { compareTitles } from '../src/lib/title-sort.js';
import { sortSearchEntries } from '../src/lib/search-data.js';

const distDir = path.join(process.cwd(), 'dist');
const searchDataPath = path.join(distDir, 'search-data.json');
const sitemapPath = path.join(distDir, 'sitemap.xml');

assert.ok(fs.existsSync(searchDataPath), 'dist/search-data.json must exist; run npm run build first');
assert.ok(fs.existsSync(sitemapPath), 'dist/sitemap.xml must exist; run npm run build first');

const searchEntries = JSON.parse(fs.readFileSync(searchDataPath, 'utf8'));
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const sitemapUrls = new Set(
  Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]),
);
const firstSitemapUrl = sitemapUrls.values().next().value;
const ORIGIN = firstSitemapUrl ? new URL(firstSitemapUrl).origin : 'https://taopedia.org';

// Duplicate titles are valid article metadata, so the search-data endpoint
// breaks same-title ties on the slug — the same tiebreak every other article
// listing on the site uses. Comparing the full canonical URL instead diverges
// when one slug is a prefix of another: for "alpha" and "alpha_beta" the slug
// order is [alpha, alpha_beta] but the URL order is [alpha_beta, alpha] (the "/"
// after the shared prefix sorts before the "_"). Use that prefix pair so the
// assertion fails under a URL tiebreak and pins the slug order.
assert.deepEqual(
  sortSearchEntries([
    { title: 'Shared Title', slug: 'alpha_beta', summary: '', url: `${ORIGIN}/wiki/alpha_beta/`, categories: [] },
    { title: 'Shared Title', slug: 'alpha', summary: '', url: `${ORIGIN}/wiki/alpha/`, categories: [] },
  ]).map((entry) => entry.slug),
  ['alpha', 'alpha_beta'],
  'same-title search entries must tiebreak on the slug (alpha before alpha_beta), matching the rest of the site, NOT the full canonical URL',
);

// The slug tiebreak must use a PLAIN code-unit comparison — the canonical contract
// sortPagesByTitle / getArticleReferences / getCategoryArticles follow — NOT
// compareTitles' numeric collation. For two same-title members "subnet_9" and
// "subnet_10" the article listings (raw id order) put "subnet_10" first ('1' < '9'),
// while a numeric slug collation would put "subnet_9" first, ordering search results
// differently than every listing on the site. Pin "subnet_10" before "subnet_9".
assert.deepEqual(
  sortSearchEntries([
    { title: 'Shared Title', slug: 'subnet_9', summary: '', url: `${ORIGIN}/wiki/subnet_9/`, categories: [] },
    { title: 'Shared Title', slug: 'subnet_10', summary: '', url: `${ORIGIN}/wiki/subnet_10/`, categories: [] },
  ]).map((entry) => entry.slug),
  ['subnet_10', 'subnet_9'],
  'same-title search entries must tiebreak on the slug with a PLAIN code-unit comparison (subnet_10 before subnet_9), matching sortPagesByTitle / references / category listings, NOT numeric collation',
);

assert.ok(Array.isArray(searchEntries), 'search data must serialize an array');
assert.ok(searchEntries.length > 0, 'search data must include article entries');

const invalidUrls = [];
const missingFromSitemap = [];
const badSlugs = [];

for (const entry of searchEntries) {
  if (typeof entry.url !== 'string' || !entry.url.startsWith(`${ORIGIN}/wiki/`)) {
    invalidUrls.push(entry.url);
    continue;
  }

  if (!sitemapUrls.has(entry.url)) {
    missingFromSitemap.push(entry.url);
  }

  // Each entry exposes the article slug it derives its url from, so a search
  // consumer can key/dedupe results by slug instead of parsing the url. It must
  // be a non-empty string consistent with the canonical url.
  if (typeof entry.slug !== 'string' || !entry.slug || entry.url !== `${ORIGIN}/wiki/${entry.slug}/`) {
    badSlugs.push(`${entry.slug} -> ${entry.url}`);
  }
}

assert.equal(
  invalidUrls.length,
  0,
  `search data URLs must use canonical trailing-slash article paths:\n${invalidUrls.slice(0, 10).join('\n')}`,
);
assert.equal(
  missingFromSitemap.length,
  0,
  `search data URLs must match sitemap article URLs:\n${missingFromSitemap.slice(0, 10).join('\n')}`,
);
assert.equal(
  badSlugs.length,
  0,
  `every search entry must expose a non-empty slug consistent with its canonical url:\n${badSlugs.slice(0, 10).join('\n')}`,
);

// The entries must be in a deterministic order: by title (numeric collation),
// then by slug with a PLAIN code-unit comparison as a tiebreak — the SAME comparator
// the endpoint uses (sortSearchEntries) and the canonical sortPagesByTitle contract.
// Re-derive the expected order independently from the article sources and assert the
// built file matches exactly — so the ordering is pinned and cannot silently regress
// or vary with the unspecified getCollection() order.
const contentDir = path.join(process.cwd(), 'src', 'content', 'pages');
const expected = [];
for (const dirent of fs.readdirSync(contentDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const slug = dirent.name;
  const source = ['index.mdx', 'index.md']
    .map((name) => path.join(contentDir, slug, name))
    .find((file) => fs.existsSync(file));
  if (!source) continue;
  const { data } = matter(fs.readFileSync(source, 'utf8'));
  if (!data || typeof data.title !== 'string') continue;
  expected.push({ title: data.title, slug, url: `${ORIGIN}/wiki/${slug}/` });
}
expected.sort((a, b) => compareTitles(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

assert.equal(
  searchEntries.length,
  expected.length,
  `search data must list all ${expected.length} articles (got ${searchEntries.length})`,
);
for (let i = 0; i < expected.length; i++) {
  assert.equal(
    searchEntries[i].url,
    expected[i].url,
    `search entries out of order at index ${i}: expected ${expected[i].url} ("${expected[i].title}"), got ${searchEntries[i].url} ("${searchEntries[i].title}")`,
  );
}

console.log(`Search data check passed (${searchEntries.length} entries, canonical URLs, deterministic title+plain-slug order)`);
