import assert from 'node:assert/strict';
import { buildStructuredData, serializeStructuredData } from './structured-data.js';

const siteUrl = 'https://taopedia.org/';

// Website pages: WebSite entity with a SearchAction pointing at /search.
const home = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/',
  title: undefined,
  description: 'desc',
  type: 'website',
  siteDescription: 'Site description',
});
assert.equal(home['@context'], 'https://schema.org', 'must declare the schema.org context');
const website = home['@graph'].find((node) => node['@type'] === 'WebSite');
assert.ok(website, 'every page must include a WebSite node');
assert.equal(website.url, 'https://taopedia.org/', 'WebSite url must be the site root');
assert.equal(
  website.potentialAction.target.urlTemplate,
  'https://taopedia.org/search/?q={search_term_string}',
  'SearchAction must target the canonical /search/ route',
);
assert.equal(
  home['@graph'].some((node) => node['@type'] === 'Article'),
  false,
  'website pages must not emit an Article node',
);

// Article pages: add Article + BreadcrumbList alongside the WebSite node.
const article = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/tao/',
  imageUrl: 'https://taopedia.org/og/tao.png',
  title: 'TAO',
  description: 'The native token.',
  type: 'article',
  datePublished: '2024-01-01T00:00:00.000Z',
  dateModified: '2024-06-01T00:00:00.000Z',
});
const articleNode = article['@graph'].find((node) => node['@type'] === 'Article');
const breadcrumb = article['@graph'].find((node) => node['@type'] === 'BreadcrumbList');
assert.ok(articleNode, 'article pages must include an Article node');
assert.equal(articleNode.headline, 'TAO', 'Article headline must be the page title');
assert.equal(articleNode.url, 'https://taopedia.org/wiki/tao/', 'Article url must be canonical');
assert.equal(articleNode.image, 'https://taopedia.org/og/tao.png', 'Article must carry the OG image');
assert.equal(articleNode.datePublished, '2024-01-01T00:00:00.000Z', 'Article must carry datePublished from history');
assert.equal(articleNode.dateModified, '2024-06-01T00:00:00.000Z', 'Article must carry dateModified from history');
assert.equal(articleNode.author?.['@type'], 'Organization', 'Article author must be the Taopedia organization');
assert.equal(articleNode.author?.name, 'Taopedia', 'Article author name must be Taopedia');

// Dates are optional: an article with no commit history must omit them cleanly
// (no datePublished/dateModified keys) while still carrying the author.
const articleNoDates = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/tao/',
  title: 'TAO',
  type: 'article',
});
const articleNoDatesNode = articleNoDates['@graph'].find((node) => node['@type'] === 'Article');
assert.equal('datePublished' in articleNoDatesNode, false, 'datePublished must be omitted when no history exists');
assert.equal('dateModified' in articleNoDatesNode, false, 'dateModified must be omitted when no history exists');
assert.equal(articleNoDatesNode.author?.['@type'], 'Organization', 'author must be present even without dates');
assert.ok(breadcrumb, 'article pages must include a BreadcrumbList');
assert.equal(breadcrumb.itemListElement.length, 2, 'breadcrumb must list Home and the article');
assert.equal(breadcrumb.itemListElement[1].item, 'https://taopedia.org/wiki/tao/', 'breadcrumb leaf must be canonical');

// Serialization must neutralize characters that could break out of <script>.
const serialized = serializeStructuredData(
  buildStructuredData({
    siteUrl,
    canonicalUrl: 'https://taopedia.org/wiki/x/',
    title: 'A </script><b>B</b> & C',
    description: 'x',
    type: 'article',
  }),
);
assert.equal(serialized.includes('</script>'), false, 'serialized JSON-LD must not contain a raw </script>');
assert.equal(serialized.includes('<'), false, 'serialized JSON-LD must escape <');
assert.equal(serialized.includes('>'), false, 'serialized JSON-LD must escape >');
assert.deepEqual(JSON.parse(serialized.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&')), JSON.parse(JSON.stringify(buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/x/',
  title: 'A </script><b>B</b> & C',
  description: 'x',
  type: 'article',
}))), 'escaped JSON-LD must round-trip to the original object');

console.log('Structured data check passed');
