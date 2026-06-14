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

  // Newest-updated first, then a deterministic tiebreak by canonical URL for items
  // that share an identical revision timestamp (several articles do — they were
  // imported in the same commit). The endpoint passes items in getCollection()
  // order, which Astro does not guarantee to be stable, and a stable date-only
  // sort just preserves that input order — so without the tiebreak a content-
  // neutral rebuild could reorder the feed and churn downstream caches. Both keys
  // use the JavaScript relational operators (raw lexicographic string comparison,
  // not localeCompare) so the order never depends on the build machine's locale,
  // matching the determinism used elsewhere (e.g. collectRecentChanges in
  // article-history.ts). ISO-8601 dates compare lexically
  // in chronological order; the empty string (undated) sorts last. Done here (not
  // in the endpoint) so ordering is covered by the regression check.
  const sortedItems = [...items].sort((a, b) => {
    const aDate = String(a.date ?? '');
    const bDate = String(b.date ?? '');
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    const aUrl = String(a.url ?? '');
    const bUrl = String(b.url ?? '');
    return aUrl < bUrl ? -1 : aUrl > bUrl ? 1 : 0;
  });

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
