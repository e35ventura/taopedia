import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const siteOrigin = 'https://taopedia.org';

assert.ok(fs.existsSync(sitemapPath), 'dist/sitemap.xml must exist; run npm run build first');

const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const articlePaths = Array.from(
  sitemap.matchAll(/<loc>https:\/\/taopedia\.org(\/wiki\/[^<]+\/)<\/loc>/g),
  (match) => match[1],
).filter((articlePath) => !articlePath.includes('/special/') && !articlePath.includes('/category/'));

assert.ok(articlePaths.length > 0, 'sitemap must list article URLs');

function readCanonicalHref(html) {
  const match = html.match(/<link rel="canonical" href="([^"]+)"/);
  return match ? match[1] : null;
}

function readArticleJsonLdUrl(html) {
  const scripts = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const [, rawJson] of scripts) {
    const parsed = JSON.parse(rawJson.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
    const articleNode = parsed['@graph']?.find((node) => node['@type'] === 'Article');
    if (articleNode?.url) return articleNode.url;
  }
  return null;
}

const mismatches = [];

for (const articlePath of articlePaths) {
  const canonicalUrl = `${siteOrigin}${articlePath}`;
  const pagePath = path.join(distDir, articlePath.replace(/^\//, ''), 'index.html');

  if (!fs.existsSync(pagePath)) {
    mismatches.push(`${articlePath}: missing built page at ${pagePath}`);
    continue;
  }

  const html = fs.readFileSync(pagePath, 'utf8');
  const canonicalHref = readCanonicalHref(html);
  const articleJsonLdUrl = readArticleJsonLdUrl(html);

  if (canonicalHref !== canonicalUrl) {
    mismatches.push(`${articlePath}: canonical ${canonicalHref ?? '(missing)'} !== ${canonicalUrl}`);
  }

  if (articleJsonLdUrl !== canonicalUrl) {
    mismatches.push(`${articlePath}: JSON-LD ${articleJsonLdUrl ?? '(missing)'} !== ${canonicalUrl}`);
  }
}

assert.equal(
  mismatches.length,
  0,
  `article canonical URLs must match sitemap trailing-slash paths:\n${mismatches.slice(0, 10).join('\n')}`,
);

const historyPath = path.join(distDir, 'wiki', 'dynamic_tao', 'history', 'index.html');
assert.ok(fs.existsSync(historyPath), 'sample history page must exist in dist');

const historyHtml = fs.readFileSync(historyPath, 'utf8');
const historyCanonical = readCanonicalHref(historyHtml);
assert.equal(
  historyCanonical,
  `${siteOrigin}/wiki/dynamic_tao/history/`,
  'history pages must emit a trailing-slash canonical URL',
);

console.log(`Article canonical check passed (${articlePaths.length} articles)`);
