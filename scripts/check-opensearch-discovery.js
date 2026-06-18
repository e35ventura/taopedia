import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The site builds and serves an OpenSearch Description Document at
// /opensearch.xml. For browsers to register it as a custom search engine,
// the shared <head> must advertise it with a rel="search" link — the search
// counterpart of the rel="alternate" links already guarded for the RSS feed
// (check-rss-discovery) and JSON feed (check-json-feed-discovery). Without
// it, browsers have no way to discover the OpenSearch endpoint even though
// the XML is reachable directly by URL.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

assert.match(
  seo,
  /<link\s+rel="search"\s+type="application\/opensearchdescription\+xml"\s+title="Taopedia"\s+href="\/opensearch\.xml"\s*\/>/,
  'Seo head must advertise the OpenSearch description with a rel="search" type="application/opensearchdescription+xml" link to /opensearch.xml',
);

console.log('OpenSearch discovery check passed');
