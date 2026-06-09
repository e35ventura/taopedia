// Build the Schema.org JSON-LD graph emitted in the document <head>. Kept as a
// pure function in scripts/ (like wiki-link-resolver.js and robots.js) so the
// Astro component and the regression check share one source of truth and can be
// unit tested without rendering the site.
//
// Every page advertises the WebSite entity plus a SearchAction so search engines
// can offer a sitelinks search box that targets /search. Article pages also
// describe the Article itself and a Home -> article BreadcrumbList. URLs are
// passed in already resolved (canonical/image), matching the canonical <link> in
// Seo.astro, so this function never has to re-derive origins or trailing slashes.

const SITE_NAME = 'Taopedia';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function buildStructuredData({
  siteUrl,
  canonicalUrl,
  imageUrl,
  title,
  description,
  type = 'website',
  siteName = SITE_NAME,
  siteDescription = '',
}) {
  const root = `${trimTrailingSlash(siteUrl)}/`;
  const websiteId = `${root}#website`;

  const graph = [
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: root,
      name: siteName,
      ...(siteDescription ? { description: siteDescription } : {}),
      inLanguage: 'en',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${root}search?q={search_term_string}`,
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
      inLanguage: 'en',
    });

    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: root },
        ...(title ? [{ '@type': 'ListItem', position: 2, name: title, item: canonicalUrl }] : []),
      ],
    });
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
