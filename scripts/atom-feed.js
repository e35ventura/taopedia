// Build the Atom 1.0 syndication feed served at /atom.xml. Kept as a pure
// function beside rss-feed.js and json-feed.js so the Astro endpoint and the
// regression check share one source of truth without rendering the site.

import { compareTitles } from '../src/lib/title-sort.js';

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

function toRfc3339(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function itemDate(item) {
  if (!item) return '';
  // The ?? operator only falls through on null/undefined, not on empty strings.
  // A caller that explicitly sets dateModified='' (e.g. a per-category endpoint
  // that found no history for the article) would otherwise shadow the
  // published-date fallback and lose the known-article date entirely. Treat
  // empty/whitespace-only values the same as missing so the published-date
  // fallback still fires for items the endpoint knows about but did not modify.
  const candidates = [item.dateModified, item.date, item.datePublished];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
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

  // Same ordering contract as the RSS and JSON feeds: newest modified first,
  // with compareTitles on canonical URLs so numeric slugs order consistently.
  const sortedItems = [...items].sort((a, b) => {
    const aDate = itemDate(a);
    const bDate = itemDate(b);
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    const aUrl = String(a.url ?? '');
    const bUrl = String(b.url ?? '');
    return compareTitles(aUrl, bUrl);
  });

  const newestItemDate = itemDate(sortedItems.find((item) => itemDate(item)));
  const feedUpdated = toRfc3339(updated ?? newestItemDate) || '1970-01-01T00:00:00.000Z';

  const entryXml = sortedItems
    .map((item) => {
      const url = cleanText(item.url);
      const itemTitle = cleanText(item.title);
      const summary = cleanText(item.description ?? item.summary);
      const datePublished = toRfc3339(item.datePublished);
      const dateModified = toRfc3339(itemDate(item)) || feedUpdated;
      const categories = (Array.isArray(item.categories) ? item.categories : [])
        .map(cleanText)
        .filter(Boolean)
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
