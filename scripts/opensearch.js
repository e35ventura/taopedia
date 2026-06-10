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
  // Advertise the existing favicon assets so user agents that surface the site
  // as a search engine (the browser "add search engine" flow) show its icon
  // instead of a blank placeholder. These files ship in public/.
  const icon16 = `${base}/favicon-16x16.png`;
  const icon32 = `${base}/favicon-32x32.png`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    `  <ShortName>${escapeXml(siteName)}</ShortName>`,
    `  <Description>${escapeXml(description)}</Description>`,
    `  <Image height="16" width="16" type="image/png">${escapeXml(icon16)}</Image>`,
    `  <Image height="32" width="32" type="image/png">${escapeXml(icon32)}</Image>`,
    `  <InputEncoding>UTF-8</InputEncoding>`,
    `  <Url type="text/html" method="get" template="${escapeXml(searchTemplate)}" />`,
    '</OpenSearchDescription>',
    '',
  ].join('\n');
}
