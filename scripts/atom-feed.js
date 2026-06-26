// Build the Atom 1.0 syndication feed served at /atom.xml. Kept as a pure
// function beside rss-feed.js and json-feed.js so the Astro endpoint and the
// regression check share one source of truth without rendering the site.

import { compareFeedItemsByDateAndKey } from '../src/lib/feed-item-sort.js';
import { itemDate, toRfc3339 } from '../src/lib/feed-item-date.js';
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

function cleanText(value) {
  return String(value ?? '').trim();
}

export function buildAtomFeed({
  siteUrl,
  items = [],
  feedPath = '/atom.xml',
  title = SITE_NAME,
  description = FEED_DESCRIPTION,
  language = 'en',
  homePageUrl,
  updated,
  authorName = SITE_NAME,
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const feedUrl = `${root.replace(/\/$/, '')}${feedPath}`;
  const pageUrl = homePageUrl ? String(homePageUrl) : root;

  // Same ordering contract as RSS and JSON Feed: newest modified first, then
  // compareFeedItemsByDateAndKey (explicit sortKey, else wiki slug from URL).
  const sortedItems = [...items].sort((a, b) => compareFeedItemsByDateAndKey(a, b, itemDate));

  const newestItemDate = itemDate(sortedItems.find((item) => itemDate(item)));
  const feedUpdated = toRfc3339(updated ?? newestItemDate) || '1970-01-01T00:00:00.000Z';

  const entryXml = sortedItems
    .map((item) => {
      const url = cleanText(item.url);
      const itemTitle = cleanText(item.title);
      const summary = cleanText(item.description ?? item.summary);
      const datePublished = toRfc3339(item.datePublished);
      const dateModified = toRfc3339(itemDate(item)) || feedUpdated;
      const categories = uniqueFeedCategories(item.categories)
        .map((category) => `    <category term="${escapeXml(category)}" />`);

      return [
        '  <entry>',
        `    <id>${escapeXml(cleanText(item.id) || url)}</id>`,
        `    <title>${escapeXml(itemTitle || url)}</title>`,
        `    <link rel="alternate" href="${escapeXml(url)}" />`,
        // Per-item article image (the Open Graph card) as an Atom enclosure link,
        // so readers can show a thumbnail for each entry.
        item.image
          ? `    <link rel="enclosure" type="image/png" href="${escapeXml(cleanText(item.image))}" />`
          : '',
        `    <updated>${escapeXml(dateModified)}</updated>`,
        datePublished ? `    <published>${escapeXml(datePublished)}</published>` : '',
        summary ? `    <summary>${escapeXml(summary)}</summary>` : '',
        ...categories,
        '  </entry>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(language)}">\n` +
    `  <id>${escapeXml(feedUrl)}</id>\n` +
    `  <title>${escapeXml(title)}</title>\n` +
    `  <subtitle>${escapeXml(description)}</subtitle>\n` +
    `  <link rel="alternate" href="${escapeXml(pageUrl)}" />\n` +
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}" />\n` +
    // Feed branding: <logo> is the wider brand mark, <icon> the small square
    // favicon, both shown by Atom readers next to the feed title.
    `  <logo>${escapeXml(`${root}logo.svg`)}</logo>\n` +
    `  <icon>${escapeXml(`${root}favicon-32x32.png`)}</icon>\n` +
    `  <updated>${escapeXml(feedUpdated)}</updated>\n` +
    `  <author><name>${escapeXml(authorName)}</name></author>\n` +
    (entryXml ? `${entryXml}\n` : '') +
    '</feed>\n'
  );
}
