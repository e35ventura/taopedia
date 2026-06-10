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
    `  <Url type="text/html" method="get" template="${escapeXml(searchTemplate)}" />`,
    '</OpenSearchDescription>',
    '',
  ].join('\n');
}
