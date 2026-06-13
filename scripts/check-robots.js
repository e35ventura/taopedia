import assert from 'node:assert/strict';
import { buildRobotsTxt } from './robots.js';

const body = buildRobotsTxt({ origin: 'https://taopedia.org' });

assert.match(body, /^User-agent: \*/m, 'robots.txt must declare a user-agent group');
assert.match(
  body,
  /^Content-Signal: search=yes, ai-train=no$/m,
  'robots.txt must declare Content Signals at the standard default (search allowed, AI training declined)',
);
// The Content-Signal directive must sit inside the User-agent group (before the
// Sitemap line, which ends the group), or crawlers will not associate it.
assert.ok(
  body.indexOf('Content-Signal:') < body.indexOf('Sitemap:'),
  'Content-Signal must appear within the User-agent group, before the Sitemap line',
);
assert.match(body, /^Allow: \//m, 'robots.txt must allow general crawling');
assert.match(body, /^Disallow: \/search$/m, 'robots.txt must keep crawlers off the search route');
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
