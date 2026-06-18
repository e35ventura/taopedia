import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`: the site must ship a branded not-found page.
// Netlify serves dist/404.html for any missing URL; without it, readers who
// follow a stale or mistyped link land on Netlify's generic error page with
// no way back into the wiki.

const distDir = path.join(process.cwd(), 'dist');
const notFoundHtml = path.join(distDir, '404.html');
assert.ok(
  fs.existsSync(notFoundHtml),
  'dist/404.html not found; run the build first (Netlify would serve its unbranded default error page)',
);

const html = fs.readFileSync(notFoundHtml, 'utf8');

assert.match(
  html,
  /<title>Page not found - Taopedia<\/title>/,
  'the not-found page must carry the standard Taopedia title',
);
assert.match(
  html,
  /<meta name="robots" content="noindex"\s*\/?>/,
  'the not-found page must declare noindex so crawlers do not index error URLs',
);

// Readers must be able to recover: the site header (with its search box) and
// explicit ways back into the wiki.
assert.ok(
  html.includes('mw-header'),
  'the not-found page must keep the site header so readers can navigate back',
);
assert.ok(
  html.includes('mw-search-input'),
  'the not-found page must keep the header search box',
);
assert.ok(html.includes('href="/search/"'), 'the not-found page must link to search');
assert.ok(
  html.includes('href="/wiki/special/allpages/"'),
  'the not-found page must link to the article directory',
);
assert.ok(
  html.includes('href="/wiki/special/categories/"'),
  'the not-found page must link to the topics listing',
);
assert.match(
  html,
  /<a href="\/"[^>]*>main page<\/a>/,
  'the not-found page body must link back to the main page',
);

// The error page is not content: it must stay out of the sitemap.
const sitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
assert.equal(
  /<loc>[^<]*\/404\/?<\/loc>/.test(sitemap),
  false,
  'the not-found page must not be advertised in the sitemap',
);

console.log('404 page check passed');
