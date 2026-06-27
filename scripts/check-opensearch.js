import assert from 'node:assert/strict';
import { buildOpenSearchDescription } from './opensearch.js';

const body = buildOpenSearchDescription({ origin: 'https://taopedia.org' });

assert.match(
  body,
  /^<OpenSearchDescription xmlns="http:\/\/a9\.com\/-\/spec\/opensearch\/1\.1\/">/m,
  'OpenSearch description must declare the 1.1 namespace',
);
assert.match(body, /<ShortName>Taopedia<\/ShortName>/, 'OpenSearch description must name the site');
assert.match(body, /<InputEncoding>UTF-8<\/InputEncoding>/, 'OpenSearch description must use UTF-8');
assert.match(
  body,
  /<Url type="text\/html" method="get" template="https:\/\/taopedia\.org\/search\/\?q=\{searchTerms\}" \/>/,
  'OpenSearch URL template must target the canonical /search/ route',
);

// Brand icons (the favicons that ship in public/) so user agents can show the
// search engine's icon next to its entry in the search box.
assert.match(
  body,
  /<Image height="16" width="16" type="image\/png">https:\/\/taopedia\.org\/favicon-16x16\.png<\/Image>/,
  'OpenSearch description must advertise the 16x16 favicon as an <Image>',
);
assert.match(
  body,
  /<Image height="32" width="32" type="image\/png">https:\/\/taopedia\.org\/favicon-32x32\.png<\/Image>/,
  'OpenSearch description must advertise the 32x32 favicon as an <Image>',
);

// Self-reference URL so aggregators can locate and re-fetch the description doc.
assert.match(
  body,
  /<Url type="application\/opensearchdescription\+xml" rel="self" template="https:\/\/taopedia\.org\/opensearch\.xml" \/>/,
  'OpenSearch description must include a rel="self" URL pointing at /opensearch.xml',
);

const normalizedBody = buildOpenSearchDescription({ origin: 'https://taopedia.org/' });
assert.match(
  normalizedBody,
  /template="https:\/\/taopedia\.org\/search\/\?q=\{searchTerms\}"/,
  'OpenSearch URL template must normalize trailing slashes on the origin',
);
// The icon and self-reference URLs must normalize the trailing slash too, so a
// trailing-slash origin never yields a double slash in the asset/self URLs.
assert.match(
  normalizedBody,
  /<Image height="16" width="16" type="image\/png">https:\/\/taopedia\.org\/favicon-16x16\.png<\/Image>/,
  'OpenSearch <Image> URLs must normalize trailing slashes on the origin',
);
assert.match(
  normalizedBody,
  /template="https:\/\/taopedia\.org\/opensearch\.xml"/,
  'OpenSearch rel="self" URL must normalize trailing slashes on the origin',
);

const escapedBody = buildOpenSearchDescription({
  origin: 'https://taopedia.org',
  siteName: 'Tao <pedia>',
  description: 'Search "TAO" & subnets',
});
assert.match(escapedBody, /<ShortName>Tao &lt;pedia&gt;<\/ShortName>/, 'site name must be XML-escaped');
assert.match(
  escapedBody,
  /<Description>Search &quot;TAO&quot; &amp; subnets<\/Description>/,
  'description must be XML-escaped',
);

console.log('OpenSearch check passed');
