import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site builds and serves a JSON Feed 1.1 feed at /feed.json. Feed readers
// need the shared <head> to advertise it with rel="alternate"; otherwise the
// endpoint is only useful to clients that already know the URL.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

assert.match(
  seo,
  /<link\s+rel="alternate"\s+type="application\/feed\+json"\s+title="Taopedia"\s+href="\/feed\.json"\s*\/>/,
  'Seo head must advertise the JSON Feed with a rel="alternate" type="application/feed+json" link to /feed.json',
);

console.log('JSON Feed discovery check passed');
