import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Category-scoped RSS feeds ship at /wiki/category/<Topic>/rss.xml (#293) but feed
// readers only auto-discover them when the category hub advertises rel="alternate"
// in <head> — the same contract as the site-wide RSS link in Seo.astro.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const categoryPage = fs.readFileSync(
  path.join(projectRoot, 'src', 'pages', 'wiki', 'category', '[category].astro'),
  'utf8',
);
const wikiLayout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

assert.match(
  categoryPage,
  /rssAlternate=\{\{\s*href:\s*`\/wiki\/category\/\$\{category\}\/rss\.xml`/,
  'category hub must pass the nested RSS feed URL to WikiLayout',
);
assert.match(
  categoryPage,
  /title:\s*`Taopedia - \$\{categoryName\} articles`/,
  'category hub must reuse the category feed channel title for discovery',
);

assert.match(wikiLayout, /rssAlternate\?:/, 'WikiLayout must accept rssAlternate');
assert.match(wikiLayout, /rssAlternate=\{rssAlternate\}/, 'WikiLayout must forward rssAlternate to Seo');

assert.match(seo, /rssAlternate\?:/, 'Seo must accept rssAlternate');
assert.match(
  seo,
  /<link rel="alternate" type="application\/rss\+xml" title=\{rssAlternate\.title\} href=\{rssAlternate\.href\} \/>/,
  'Seo must render a category-scoped rel="alternate" RSS link when rssAlternate is set',
);

console.log('Category RSS discovery check passed');
