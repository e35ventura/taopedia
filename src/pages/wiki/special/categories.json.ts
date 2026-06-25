import type { APIRoute } from 'astro';
import { buildCategories } from '../../../../scripts/categories.js';
import categoriesIndex from '../../../../public/data/categories.json';

// Machine-readable topic index at /wiki/special/categories.json. Mirrors the
// HTML Special:Categories page as structured JSON for programmatic consumers
// (dashboards, navigation, cross-referencing tools). The computation is shared
// through scripts/categories.js (pure function) so the endpoint and the
// regression check derive from one source of truth, and topics are ordered with
// the same compareTitles numeric collation the HTML page uses.

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/categories.json — the same artifact check-categories-json.js
  // cross-references — instead of calling getCollection('pages') and re-scanning
  // every article's categories frontmatter. Matches feeds.opml.ts (#1299).
  const topics = buildCategories({ categoriesIndex });

  const body = JSON.stringify(
    {
      site: origin,
      categoriesJsonUrl: `${origin}/wiki/special/categories.json`,
      count: topics.length,
      categories: topics.map((topic) => ({
        name: topic.name,
        slug: topic.slug,
        articles: topic.count,
        url: `${origin}/wiki/category/${topic.slug}/`,
        articlesUrl: `${origin}/wiki/category/${topic.slug}/articles.json`,
        // articlesJsonUrl is the same article-list link under the consistent
        // <name>JsonUrl key every other JSON companion uses (infoJsonUrl,
        // historyJsonUrl, backlinksJsonUrl, citeJsonUrl) and the category page
        // envelope itself exposes as articlesJsonUrl. articlesUrl was the lone
        // outlier naming it without the Json suffix; it is kept for backwards
        // compatibility and articlesJsonUrl is the consistent name.
        articlesJsonUrl: `${origin}/wiki/category/${topic.slug}/articles.json`,
        feedUrl: `${origin}/wiki/category/${topic.slug}/feed.json`,
        // feedJsonUrl is the same JSON Feed link under the consistent
        // <name>JsonUrl key every other JSON companion uses (articlesJsonUrl,
        // infoJsonUrl, historyJsonUrl, backlinksJsonUrl, citeJsonUrl). feedUrl
        // was the lone outlier naming it without the Json suffix; it is kept for
        // backwards compatibility and feedJsonUrl is the consistent name.
        feedJsonUrl: `${origin}/wiki/category/${topic.slug}/feed.json`,
        atomUrl: `${origin}/wiki/category/${topic.slug}/atom.xml`,
        rssUrl: `${origin}/wiki/category/${topic.slug}/rss.xml`,
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
