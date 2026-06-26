const DEFAULT_SITE_NAME = 'Taopedia';
const DEFAULT_DESCRIPTION = 'Search the Taopedia Bittensor knowledge base';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

export function buildOpenSearchDescription({
  origin,
  siteName = DEFAULT_SITE_NAME,
  description = DEFAULT_DESCRIPTION,
}) {
  const base = trimTrailingSlash(origin || 'https://taopedia.org');
  const searchTemplate = `${base}/search/?q={searchTerms}`;
  const selfTemplate = `${base}/opensearch.xml`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    `  <ShortName>${escapeXml(siteName)}</ShortName>`,
    `  <Description>${escapeXml(description)}</Description>`,
    `  <InputEncoding>UTF-8</InputEncoding>`,
    // Brand icons so a user agent can show the search engine's favicon next to
    // its entry in the search box. The 16x16 and 32x32 PNGs already ship in
    // public/ (the same ones the <head> favicons reference), and the spec allows
    // multiple <Image> elements at different resolutions.
    `  <Image height="16" width="16" type="image/png">${escapeXml(`${base}/favicon-16x16.png`)}</Image>`,
    `  <Image height="32" width="32" type="image/png">${escapeXml(`${base}/favicon-32x32.png`)}</Image>`,
    `  <Url type="text/html" method="get" template="${escapeXml(searchTemplate)}" />`,
    // Self-reference to this description document, so user agents and aggregators
    // can locate and re-fetch it to pick up updates (recommended by the spec).
    `  <Url type="application/opensearchdescription+xml" rel="self" template="${escapeXml(selfTemplate)}" />`,
    '</OpenSearchDescription>',
    '',
  ].join('\n');
}
