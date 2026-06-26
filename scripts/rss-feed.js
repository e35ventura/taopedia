// Build the RSS 2.0 syndication feed served at /rss.xml. Kept as a pure function
// in scripts/ (like structured-data.js, robots.js, and wiki-link-resolver.js) so
// the Astro endpoint and the regression check share one source of truth and can
// be unit tested without rendering the site.
//
// Items are passed in already resolved (canonical article URL, ISO-8601 date from
// the generated revision history) so this function never re-derives origins or
// trailing slashes; it only formats and escapes the channel/item XML.

import { compareFeedItemsByDateAndKey } from '../src/lib/feed-item-sort.js';
import { itemDate } from '../src/lib/feed-item-date.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

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
  channelLink,
  lastBuildDate,
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const selfHref = `${root.replace(/\/$/, '')}${feedPath}`;
  const channelHref = channelLink ? String(channelLink) : root;

  // Newest-updated first, then a deterministic tiebreak for items that share an
  // identical revision timestamp. Recent-changes feeds pass sortKey = article slug;
  // site-wide feeds omit it, so compareFeedItemsByDateAndKey extracts the wiki
  // slug from the canonical /wiki/<slug>/ URL instead of comparing the full URL
  // (prefix slugs like alpha vs alpha_beta invert under URL collation).
  const sortedItems = [...items].sort((a, b) => compareFeedItemsByDateAndKey(a, b, itemDate));

  const itemXml = sortedItems
    .map((item) => {
      const pubDate = toRfc822(itemDate(item));
      const categoryXml = uniqueFeedCategories(item.categories)
        .map((category) => `      <category>${escapeXml(category)}</category>`);

      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="${item.guid ? String(item.guidIsPermaLink ?? false) : 'true'}">${escapeXml(item.guid ?? item.url)}</guid>`,
        item.description ? `      <description>${escapeXml(item.description)}</description>` : '',
        ...categoryXml,
        pubDate ? `      <pubDate>${escapeXml(pubDate)}</pubDate>` : '',
        // Per-item article image (the article's Open Graph card) so feed readers
        // can show a thumbnail for each entry. Emitted via Media RSS, which —
        // unlike an RSS <enclosure> — does not require a byte length.
        item.image
          ? `      <media:content url="${escapeXml(item.image)}" type="image/png" medium="image" width="1200" height="630" />`
          : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  // Default the channel's lastBuildDate to the newest item date when not given.
  const channelLastBuild = toRfc822(lastBuildDate ?? itemDate(sortedItems.find((item) => itemDate(item))));

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n' +
    '  <channel>\n' +
    `    <title>${escapeXml(title)}</title>\n` +
    `    <link>${escapeXml(channelHref)}</link>\n` +
    `    <description>${escapeXml(description)}</description>\n` +
    `    <language>${escapeXml(language)}</language>\n` +
    // Channel branding: feed readers show this alongside the feed title. RSS
    // <image> wants a raster within 144x400, so use the 32x32 favicon PNG.
    '    <image>\n' +
    `      <url>${escapeXml(`${root}favicon-32x32.png`)}</url>\n` +
    `      <title>${escapeXml(title)}</title>\n` +
    `      <link>${escapeXml(channelHref)}</link>\n` +
    '    </image>\n' +
    (channelLastBuild ? `    <lastBuildDate>${escapeXml(channelLastBuild)}</lastBuildDate>\n` : '') +
    `    <atom:link href="${escapeXml(selfHref)}" rel="self" type="application/rss+xml" />\n` +
    (itemXml ? `${itemXml}\n` : '') +
    '  </channel>\n' +
    '</rss>\n'
  );
}
