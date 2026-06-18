import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site builds and serves an Atom 1.0 feed at /atom.xml. Feed readers need
// the shared <head> to advertise it with rel="alternate"; otherwise the endpoint
// is only useful to clients that already know the URL.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

assert.match(
  seo,
  /<link\s+rel="alternate"\s+type="application\/atom\+xml"\s+title="Taopedia"\s+href="\/atom\.xml"\s*\/>/,
  'Seo head must advertise the Atom feed with a rel="alternate" type="application/atom+xml" link to /atom.xml',
);

console.log('Atom feed discovery check passed');
