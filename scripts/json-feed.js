// Build the JSON Feed 1.1 syndication feed served at /feed.json. Kept as a pure
// function beside rss-feed.js so the Astro endpoint and regression check share
// one source of truth without rendering the site.

import { compareFeedItemsByDateAndKey } from '../src/lib/feed-item-sort.js';
import { itemDate, toRfc3339 } from '../src/lib/feed-item-date.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';
const SITE_NAME = 'Taopedia';
const FEED_DESCRIPTION =
  'Recently updated articles from Taopedia, a Bittensor-focused knowledge base.';

function cleanText(value) {
  return String(value ?? '').trim();
}

export function buildJsonFeed({
  siteUrl,
  items = [],
  feedPath = '/feed.json',
  title = SITE_NAME,
  description = FEED_DESCRIPTION,
  language = 'en',
  homePageUrl,
  authorName = SITE_NAME,
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const feedUrl = `${root.replace(/\/$/, '')}${feedPath}`;
  const pageUrl = homePageUrl ? String(homePageUrl) : root;

  // Same ordering contract as RSS and Atom: newest modified first, then
  // compareFeedItemsByDateAndKey (explicit sortKey, else wiki slug from URL).
  const sortedItems = [...items].sort((a, b) => compareFeedItemsByDateAndKey(a, b, itemDate));

  const feed = {
    version: JSON_FEED_VERSION,
    title,
    home_page_url: pageUrl,
    feed_url: feedUrl,
    description,
    // Feed branding (JSON Feed `icon` is the large square logo, `favicon` the
    // small one): readers display these next to the feed title.
    icon: `${root}apple-touch-icon.png`,
    favicon: `${root}favicon-32x32.png`,
    language,
    // JSON Feed 1.1 `authors` (the singular `author` is deprecated in 1.1): the
    // collaborative site name, mirroring the Atom feed's <author><name> so a
    // JSON Feed reader gets the same author attribution an Atom reader does. Name
    // only, no url/email — consistent with Atom and with the site's policy of not
    // exposing individual contributor identities (see scripts/citations.js). RSS
    // legitimately omits it because RSS 2.0 <author>/<managingEditor> require an
    // email address, which the site deliberately does not publish.
    authors: [{ name: authorName }],
    items: sortedItems.map((item) => {
      const url = cleanText(item.url);
      const itemTitle = cleanText(item.title);
      const summary = cleanText(item.description ?? item.summary);
      const image = cleanText(item.image);
      const contentText = cleanText(item.contentText ?? summary) || itemTitle || url;
      const datePublished = toRfc3339(item.datePublished);
      // date_modified uses the same known-date fallback as the RSS and Atom
      // feeds (modified -> legacy date -> published). Without the published
      // fallback a published-only item — a draft that has never been
      // modified since publication — would emit no date_modified and lose
      // the last-modified signal a feed reader sorts on.
      const dateModified = toRfc3339(itemDate(item));
      const tags = uniqueFeedCategories(item.categories);

      return {
        id: cleanText(item.id) || url,
        url,
        ...(itemTitle ? { title: itemTitle } : {}),
        content_text: contentText,
        ...(summary ? { summary } : {}),
        // Per-item article image (the Open Graph card): JSON Feed's first-class
        // item-level image, the JSON counterpart to the RSS media:content / Atom
        // enclosure, so JSON readers can show a thumbnail per entry too.
        ...(image ? { image } : {}),
        ...(datePublished ? { date_published: datePublished } : {}),
        ...(dateModified ? { date_modified: dateModified } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      };
    }),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}
