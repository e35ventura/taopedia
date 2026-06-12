// Build the RSS 2.0 syndication feed served at /rss.xml. Kept as a pure function
// in scripts/ (like structured-data.js, robots.js, and wiki-link-resolver.js) so
// the Astro endpoint and the regression check share one source of truth and can
// be unit tested without rendering the site.
//
// Items are passed in already resolved (canonical article URL, ISO-8601 date from
// the generated revision history) so this function never re-derives origins or
// trailing slashes; it only formats and escapes the channel/item XML.

const SITE_NAME = 'Taopedia';
const FEED_DESCRIPTION =
  'Recently updated articles from Taopedia, a Bittensor-focused knowledge base.';

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
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

// RSS <pubDate>/<lastBuildDate> use the RFC 822 date format. Date#toUTCString
// emits the RFC 1123 profile of RFC 822 (e.g. "Tue, 10 Jun 2026 20:06:02 GMT"),
// which validators accept. Invalid/empty dates are dropped rather than emitted.
function toRfc822(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
}

export function buildRssFeed({
  siteUrl,
  items = [],
  feedPath = '/rss.xml',
  title = SITE_NAME,
  description = FEED_DESCRIPTION,
  language = 'en',
  lastBuildDate,
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const selfHref = `${root.replace(/\/$/, '')}${feedPath}`;

  // Newest-updated first. ISO-8601 dates sort lexically in chronological order;
  // undated items sort last. Done here (not in the endpoint) so ordering is
  // covered by the regression check rather than untested endpoint glue.
  const sortedItems = [...items].sort((a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? '')),
  );

  const itemXml = sortedItems
    .map((item) => {
      const pubDate = toRfc822(item.date);
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
        item.description ? `      <description>${escapeXml(item.description)}</description>` : '',
        pubDate ? `      <pubDate>${escapeXml(pubDate)}</pubDate>` : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  // Default the channel's lastBuildDate to the newest item date when not given.
  const channelLastBuild = toRfc822(lastBuildDate ?? sortedItems.find((item) => item.date)?.date);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
    '  <channel>\n' +
    `    <title>${escapeXml(title)}</title>\n` +
    `    <link>${escapeXml(root)}</link>\n` +
    `    <description>${escapeXml(description)}</description>\n` +
    `    <language>${escapeXml(language)}</language>\n` +
    (channelLastBuild ? `    <lastBuildDate>${escapeXml(channelLastBuild)}</lastBuildDate>\n` : '') +
    `    <atom:link href="${escapeXml(selfHref)}" rel="self" type="application/rss+xml" />\n` +
    (itemXml ? `${itemXml}\n` : '') +
    '  </channel>\n' +
    '</rss>\n'
  );
}
