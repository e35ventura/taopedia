import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildCategories } from '../../../../scripts/categories.js';

// Machine-readable topic index at /wiki/special/categories.json. Mirrors the
// HTML Special:Categories page as structured JSON for programmatic consumers
// (dashboards, navigation, cross-referencing tools). The computation is shared
// through scripts/categories.js (pure function) so the endpoint and the
// regression check derive from one source of truth, and topics are ordered with
// the same compareTitles numeric collation the HTML page uses.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const topics = buildCategories({ pages });

  const body = JSON.stringify(
    {
      site: origin,
      categoriesJsonUrl: `${origin}/wiki/special/categories.json`,
      count: topics.length,
      categories: topics.map((topic) => {
        // slug is the single URL-safe route token for the category; every route
        // URL below is built from it, and it is exposed so a consumer can build
        // category routes without re-deriving the escaping (the same slug parity
        // search-data.json exposes per article).
        const slug = topic.name.replace(/ /g, '_');
        const base = `${origin}/wiki/category/${slug}`;
        return {
          name: topic.name,
          slug,
          articles: topic.count,
          url: `${base}/`,
          articlesUrl: `${base}/articles.json`,
          feedUrl: `${base}/feed.json`,
          atomUrl: `${base}/atom.xml`,
          rssUrl: `${base}/rss.xml`,
        };
      }),
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
