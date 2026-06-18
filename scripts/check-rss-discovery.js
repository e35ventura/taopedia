import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site builds and serves a full RSS 2.0 feed at /rss.xml (rss.xml.ts,
// scripts/rss-feed.js). For feed readers and browsers to discover it, the shared
// <head> must advertise it with a rel="alternate" link — the feed counterpart of
// the OpenSearch rel="search" link already present in Seo.astro. Without it the
// feed is reachable only by guessing the URL.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

assert.match(
  seo,
  /<link\s+rel="alternate"\s+type="application\/rss\+xml"\s+title="Taopedia"\s+href="\/rss\.xml"\s*\/>/,
  'Seo head must advertise the RSS feed with a rel="alternate" type="application/rss+xml" link to /rss.xml',
);

console.log('RSS discovery check passed');
