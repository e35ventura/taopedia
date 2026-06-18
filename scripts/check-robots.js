import assert from 'node:assert/strict';
import { buildRobotsTxt } from './robots.js';

const body = buildRobotsTxt({ origin: 'https://taopedia.org' });

assert.match(body, /^User-agent: \*/m, 'robots.txt must declare a user-agent group');
assert.match(body, /^Allow: \//m, 'robots.txt must allow general crawling');
assert.match(body, /^Disallow: \/search$/m, 'robots.txt must keep crawlers off the search route');
assert.match(body, /^Disallow: \/pagefind\/$/m, 'robots.txt must keep crawlers off Pagefind index assets');
// Disallow wins over the blanket Allow: / only when paths are not also Allow-listed.
// A redundant Allow for /search or /pagefind/ would reopen crawl of non-content routes.
assert.doesNotMatch(
  body,
  /^Allow: \/search/m,
  'robots.txt must not Allow the search route that is Disallow-listed',
);
assert.doesNotMatch(
  body,
  /^Allow: \/pagefind/m,
  'robots.txt must not Allow Pagefind assets that are Disallow-listed',
);
assert.match(
  body,
  /^Sitemap: https:\/\/taopedia\.org\/sitemap\.xml$/m,
  'robots.txt must advertise the absolute sitemap URL',
);

// A trailing slash on the origin must not produce a doubled slash in the URL.
assert.match(
  buildRobotsTxt({ origin: 'https://taopedia.org/' }),
  /^Sitemap: https:\/\/taopedia\.org\/sitemap\.xml$/m,
  'sitemap URL must be normalized when the origin has a trailing slash',
);

console.log('robots.txt check passed');
