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

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    `  <ShortName>${escapeXml(siteName)}</ShortName>`,
    `  <Description>${escapeXml(description)}</Description>`,
    `  <InputEncoding>UTF-8</InputEncoding>`,
    // The site favicons, so browsers render the Taopedia icon next to the search
    // engine in the address-bar/search dropdown (OpenSearch <Image>; the 16x16 is
    // the spec's recommended default size).
    `  <Image width="16" height="16" type="image/png">${escapeXml(`${base}/favicon-16x16.png`)}</Image>`,
    `  <Image width="32" height="32" type="image/png">${escapeXml(`${base}/favicon-32x32.png`)}</Image>`,
    `  <Url type="text/html" method="get" template="${escapeXml(searchTemplate)}" />`,
    '</OpenSearchDescription>',
    '',
  ].join('\n');
}
