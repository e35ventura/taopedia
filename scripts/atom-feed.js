// Build the Atom 1.0 syndication feed served at /atom.xml. Kept as a pure
// function beside rss-feed.js and json-feed.js so the Astro endpoint and the
// regression check share one source of truth without rendering the site.

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
  return String(item.dateModified ?? item.date ?? item.datePublished ?? '');
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
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const feedUrl = `${root.replace(/\/$/, '')}${feedPath}`;
  const pageUrl = homePageUrl ? String(homePageUrl) : root;

  // Same ordering contract as the RSS and JSON feeds: newest modified first,
  // with a raw string URL tiebreak so output never depends on getCollection()
  // order or the build machine's locale.
  const sortedItems = [...items].sort((a, b) => {
    const aDate = itemDate(a);
    const bDate = itemDate(b);
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    const aUrl = String(a.url ?? '');
    const bUrl = String(b.url ?? '');
    return aUrl < bUrl ? -1 : aUrl > bUrl ? 1 : 0;
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
    `  <updated>${escapeXml(feedUpdated)}</updated>\n` +
    (entryXml ? `${entryXml}\n` : '') +
    '</feed>\n'
  );
}
