import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

console.log('Search data canonical URL check passed');
