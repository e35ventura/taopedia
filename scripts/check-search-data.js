import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { compareTitles } from '../src/lib/title-sort.js';

const distDir = path.join(process.cwd(), 'dist');
const searchDataPath = path.join(distDir, 'search-data.json');
const sitemapPath = path.join(distDir, 'sitemap.xml');

assert.ok(fs.existsSync(searchDataPath), 'dist/search-data.json must exist; run npm run build first');
assert.ok(fs.existsSync(sitemapPath), 'dist/sitemap.xml must exist; run npm run build first');

const searchEntries = JSON.parse(fs.readFileSync(searchDataPath, 'utf8'));
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const sitemapPaths = new Set(
  Array.from(sitemap.matchAll(/<loc>https:\/\/taopedia\.org([^<]+)<\/loc>/g), (match) => match[1]),
);

assert.ok(Array.isArray(searchEntries), 'search data must serialize an array');
assert.ok(searchEntries.length > 0, 'search data must include article entries');

const invalidUrls = [];
const missingFromSitemap = [];

for (const entry of searchEntries) {
  if (typeof entry.url !== 'string' || !/^\/wiki\/[a-z0-9_-]+\/$/.test(entry.url)) {
    invalidUrls.push(entry.url);
    continue;
  }

  if (!sitemapPaths.has(entry.url)) {
    missingFromSitemap.push(entry.url);
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

// The entries must be in a deterministic order: by title (numeric collation),
// then by canonical URL as a tiebreak. Re-derive the expected order
// independently from the article sources using the SAME comparator the endpoint
// uses, and assert the built file matches exactly — so the ordering is pinned
// and cannot silently regress or vary with the unspecified getCollection() order.
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
  expected.push({ title: data.title, url: `/wiki/${slug}/` });
}
expected.sort((a, b) => compareTitles(a.title, b.title) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

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

console.log(`Search data check passed (${searchEntries.length} entries, canonical URLs, deterministic title+URL order)`);
