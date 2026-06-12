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
assert.match(
  body,
  /<Url type="application\/x-suggestions\+json" method="get" template="https:\/\/taopedia\.org\/suggest\?q=\{searchTerms\}" \/>/,
  'OpenSearch description must advertise the /suggest suggestions endpoint',
);

const normalizedBody = buildOpenSearchDescription({ origin: 'https://taopedia.org/' });
assert.match(
  normalizedBody,
  /template="https:\/\/taopedia\.org\/search\/\?q=\{searchTerms\}"/,
  'OpenSearch URL template must normalize trailing slashes on the origin',
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
