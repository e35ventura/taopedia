// Build the JSON Feed 1.1 syndication feed served at /feed.json. Kept as a pure
// function beside rss-feed.js so the Astro endpoint and regression check share
// one source of truth without rendering the site.

import { compareTitles } from '../src/lib/title-sort.js';

const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';
const SITE_NAME = 'Taopedia';
const FEED_DESCRIPTION =
  'Recently updated articles from Taopedia, a Bittensor-focused knowledge base.';

function cleanText(value) {
  return String(value ?? '').trim();
}

function toRfc3339(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function itemDate(item) {
  return String(item.dateModified ?? item.date ?? item.datePublished ?? '');
}

export function buildJsonFeed({
  siteUrl,
  items = [],
  feedPath = '/feed.json',
  title = SITE_NAME,
  description = FEED_DESCRIPTION,
  language = 'en',
  homePageUrl,
}) {
  const root = `${String(siteUrl ?? '').replace(/\/+$/, '')}/`;
  const feedUrl = `${root.replace(/\/$/, '')}${feedPath}`;
  const pageUrl = homePageUrl ? String(homePageUrl) : root;

  // Same ordering contract as the RSS feed: newest modified first, with
  // compareTitles on canonical URLs so numeric slugs order consistently.
  const sortedItems = [...items].sort((a, b) => {
    const aDate = itemDate(a);
    const bDate = itemDate(b);
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    const aUrl = String(a.url ?? '');
    const bUrl = String(b.url ?? '');
    return compareTitles(aUrl, bUrl);
  });

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
    items: sortedItems.map((item) => {
      const url = cleanText(item.url);
      const itemTitle = cleanText(item.title);
      const summary = cleanText(item.description ?? item.summary);
      const contentText = cleanText(item.contentText ?? summary) || itemTitle || url;
      const datePublished = toRfc3339(item.datePublished);
      const dateModified = toRfc3339(item.dateModified ?? item.date);
      const tags = (Array.isArray(item.categories) ? item.categories : [])
        .map(cleanText)
        .filter(Boolean);

      return {
        id: cleanText(item.id) || url,
        url,
        ...(itemTitle ? { title: itemTitle } : {}),
        content_text: contentText,
        ...(summary ? { summary } : {}),
        ...(datePublished ? { date_published: datePublished } : {}),
        ...(dateModified ? { date_modified: dateModified } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      };
    }),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}
