// Build the Schema.org JSON-LD graph emitted in the document <head>. Kept as a
// pure function in scripts/ (like wiki-link-resolver.js and robots.js) so the
// Astro component and the regression check share one source of truth and can be
// unit tested without rendering the site.
//
// Every page advertises the WebSite entity plus a SearchAction so search engines
// can offer a sitelinks search box that targets /search. Article pages also
// describe the Article itself, a Home -> [topic] -> article BreadcrumbList, and a DefinedTerm
// in the site's glossary (each Taopedia article defines a Bittensor term). URLs
// are passed in already resolved (canonical/image), matching the canonical <link>
// in Seo.astro, so this function never has to re-derive origins or trailing slashes.

const SITE_NAME = 'Taopedia';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function buildStructuredData({
  siteUrl,
  canonicalUrl,
  imageUrl,
  logoUrl,
  title,
  description,
  type = 'website',
  datePublished,
  dateModified,
  siteName = SITE_NAME,
  siteDescription = '',
  breadcrumbTopic,
}) {
  const root = `${trimTrailingSlash(siteUrl)}/`;
  const websiteId = `${root}#website`;
  const organizationId = `${root}#organization`;

  const graph = [
    // The publisher, marked up once site-wide as a single @id that every other
    // node references, so search engines attribute every page to one entity and
    // can surface its name/logo. Google's logo guidance wants an ImageObject, so
    // the brand mark is emitted as one whenever a logo URL is supplied.
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: siteName,
      url: root,
      ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl } } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: root,
      name: siteName,
      ...(siteDescription ? { description: siteDescription } : {}),
      publisher: { '@id': organizationId },
      inLanguage: 'en',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${root}search/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  if (type === 'article' && canonicalUrl) {
    graph.push({
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      isPartOf: { '@id': websiteId },
      url: canonicalUrl,
      ...(title ? { headline: title, name: title } : {}),
      ...(description ? { description } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(datePublished ? { datePublished } : {}),
      ...(dateModified ? { dateModified } : {}),
      // Taopedia articles are collaboratively maintained, so both the author and
      // the publisher are the site Organization (not individual git committers,
      // keeping contributor names out of the public head metadata). Reference the
      // single site-wide Organization @id rather than re-inlining it.
      author: { '@id': organizationId },
      publisher: { '@id': organizationId },
      inLanguage: 'en',
    });

    // Home > [primary topic] > this article, mirroring the visible breadcrumb on
    // the article page. The topic level is included only when the article has a
    // category; positions are assigned in order so the chain stays contiguous.
    const breadcrumbItems = [{ '@type': 'ListItem', position: 1, name: 'Home', item: root }];
    if (breadcrumbTopic && breadcrumbTopic.name && breadcrumbTopic.item) {
      breadcrumbItems.push({
        '@type': 'ListItem',
        position: breadcrumbItems.length + 1,
        name: breadcrumbTopic.name,
        item: breadcrumbTopic.item,
      });
    }
    if (title) {
      breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: title, item: canonicalUrl });
    }
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbItems,
    });

    // Most articles define a Bittensor term, so describe them as a Schema.org
    // DefinedTerm in the site's glossary (a DefinedTermSet) so search engines
    // recognize the page as a term definition. The numbered subnet pages
    // (/wiki/subnet_<n>/, e.g. subnet_92) are on-chain identity profiles rather
    // than term definitions, so they are excluded; concept pages like
    // subnet_creator keep the markup. name is required, so a title must exist.
    const slug = canonicalUrl.replace(/^.*\/wiki\//, '').replace(/\/$/, '');
    if (title && !/^subnet_\d/.test(slug)) {
      graph.push({
        '@type': 'DefinedTerm',
        '@id': `${canonicalUrl}#definedterm`,
        name: title,
        ...(description ? { description } : {}),
        url: canonicalUrl,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': `${root}#glossary`,
          name: `${siteName} Glossary`,
          url: root,
        },
      });
    }
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

// Serialize the graph for safe inlining inside a <script> element. JSON.stringify
// already escapes quotes; additionally neutralize the characters that could break
// out of the script context or be misread by an HTML parser.
export function serializeStructuredData(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
