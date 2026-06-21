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
  /<Image width="16" height="16" type="image\/png">https:\/\/taopedia\.org\/favicon-16x16\.png<\/Image>/,
  'OpenSearch description must advertise the 16x16 favicon image',
);
assert.match(
  body,
  /<Image width="32" height="32" type="image\/png">https:\/\/taopedia\.org\/favicon-32x32\.png<\/Image>/,
  'OpenSearch description must advertise the 32x32 favicon image',
);
assert.match(
  body,
  /<Url type="text\/html" method="get" template="https:\/\/taopedia\.org\/search\/\?q=\{searchTerms\}" \/>/,
  'OpenSearch URL template must target the canonical /search/ route',
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
