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

// Every page carries one site-wide Organization (publisher) node that the other
// nodes reference by @id, so search engines attribute the page to one entity.
const organization = home['@graph'].find((node) => node['@type'] === 'Organization');
assert.ok(organization, 'every page must include an Organization (publisher) node');
assert.equal(organization['@id'], 'https://taopedia.org/#organization', 'Organization must carry the canonical site @id');
assert.equal(organization.name, 'Taopedia', 'Organization name must be Taopedia');
assert.equal(organization.url, 'https://taopedia.org/', 'Organization url must be the site root');
assert.equal(website.publisher?.['@id'], organization['@id'], 'WebSite must reference the Organization as its publisher');
// The logo is emitted as a Google-compliant ImageObject only when a logo URL is
// supplied, and omitted cleanly otherwise (no empty logo key).
assert.equal('logo' in organization, false, 'Organization logo is omitted when no logo URL is supplied');
const withLogo = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/',
  type: 'website',
  logoUrl: 'https://taopedia.org/logo.svg',
});
const orgWithLogo = withLogo['@graph'].find((node) => node['@type'] === 'Organization');
assert.equal(orgWithLogo.logo?.['@type'], 'ImageObject', 'Organization logo must be an ImageObject');
assert.equal(orgWithLogo.logo?.url, 'https://taopedia.org/logo.svg', 'Organization logo url must be the supplied logo URL');
assert.equal(
  home['@graph'].some((node) => node['@type'] === 'Article'),
  false,
  'website pages must not emit an Article node',
);
assert.equal(
  home['@graph'].some((node) => node['@type'] === 'DefinedTerm'),
  false,
  'website pages must not emit a DefinedTerm node',
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
assert.equal(articleNode.author?.['@id'], 'https://taopedia.org/#organization', 'Article author must reference the site Organization');
assert.equal(articleNode.publisher?.['@id'], 'https://taopedia.org/#organization', 'Article publisher must reference the site Organization');

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
assert.equal(articleNoDatesNode.author?.['@id'], 'https://taopedia.org/#organization', 'author reference must be present even without dates');
assert.ok(breadcrumb, 'article pages must include a BreadcrumbList');
assert.equal(breadcrumb.itemListElement.length, 2, 'breadcrumb must list Home and the article');
assert.equal(breadcrumb.itemListElement[1].item, 'https://taopedia.org/wiki/tao/', 'breadcrumb leaf must be canonical');

// Article pages also describe the page as a glossary DefinedTerm (the term is the
// title, the definition is the description), belonging to the site DefinedTermSet.
const definedTerm = article['@graph'].find((node) => node['@type'] === 'DefinedTerm');
assert.ok(definedTerm, 'article pages must include a DefinedTerm node');
assert.equal(definedTerm.name, 'TAO', 'DefinedTerm name must be the term (page title)');
assert.equal(definedTerm.description, 'The native token.', 'DefinedTerm must carry the definition (description)');
assert.equal(definedTerm.url, 'https://taopedia.org/wiki/tao/', 'DefinedTerm url must be canonical');
assert.equal(definedTerm.inDefinedTermSet?.['@type'], 'DefinedTermSet', 'DefinedTerm must belong to a DefinedTermSet');
assert.equal(definedTerm.inDefinedTermSet?.name, 'Taopedia Glossary', 'the term set must be the Taopedia Glossary');
assert.equal(definedTerm.inDefinedTermSet?.url, 'https://taopedia.org/', 'the term set url must be the site root');

// A DefinedTerm requires a name, so it is omitted (not emitted nameless) when no title exists.
const definedNoTitle = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/x/',
  type: 'article',
});
assert.equal(
  definedNoTitle['@graph'].some((node) => node['@type'] === 'DefinedTerm'),
  false,
  'DefinedTerm must be omitted when no title is available',
);

// Numbered subnet pages (e.g. /wiki/subnet_92/) are on-chain identity profiles,
// not term definitions, so they emit an Article but NOT a DefinedTerm. Concept
// pages such as subnet_creator are unaffected (their slug has no leading digit).
const subnetProfile = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/subnet_92/',
  title: 'Subnet 92: wgmi',
  description: 'A Bittensor subnet.',
  type: 'article',
});
assert.ok(
  subnetProfile['@graph'].some((node) => node['@type'] === 'Article'),
  'numbered-subnet pages still emit an Article node',
);
assert.equal(
  subnetProfile['@graph'].some((node) => node['@type'] === 'DefinedTerm'),
  false,
  'numbered-subnet identity pages must not emit a DefinedTerm (profiles, not definitions)',
);
const subnetConceptDefined = buildStructuredData({
  siteUrl,
  canonicalUrl: 'https://taopedia.org/wiki/subnet_creator/',
  title: 'Subnet Creator',
  description: 'Defines a subnet.',
  type: 'article',
});
assert.ok(
  subnetConceptDefined['@graph'].some((node) => node['@type'] === 'DefinedTerm'),
  'subnet concept pages (subnet_creator) must keep the DefinedTerm',
);

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
