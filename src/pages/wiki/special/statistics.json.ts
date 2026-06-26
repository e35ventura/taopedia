import type { APIRoute } from 'astro';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { buildStatistics } from '../../../../scripts/statistics.js';
import categoriesIndex from '../../../../public/data/categories.json';
import slugMap from '../../../../public/data/slugmap.json';

// Machine-readable site statistics at /wiki/special/statistics.json. Mirrors
// the figures shown on the HTML Special:Statistics page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools).
// The computation is shared through scripts/statistics.js (pure function) so
// the endpoint and the regression check derive from one source of truth.
// Each topic carries a url so consumers can navigate directly to the category
// page without constructing the path themselves — the same field the
// categories.json endpoint already provides per category.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  // Word/revision totals only need published slugmap members — the same artifact
  // categories.json (#1403) and allpages.json read — instead of scanning every
  // content-collection entry when building site statistics.
  const publishedSlugs = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugs);
  const pages = publishedSlugs.map((slug) => pageBySlug[slug]).filter(Boolean);

  const stats = buildStatistics({
    pages,
    historyForSlug,
    getPageSlug,
    // Topic counts come from public/data/categories.json — the same artifact
    // categories.json (#1403) and feeds.opml (#1299) read — instead of re-
    // counting every article's categories frontmatter during the pages scan.
    categoriesIndex,
  });

  const topicSlug = (name: string) => name.replace(/ /g, '_');
  const topicUrl = (name: string) =>
    `${origin}/wiki/category/${name.replace(/ /g, '_')}/`;
  const topicArticlesUrl = (name: string) =>
    `${origin}/wiki/category/${name.replace(/ /g, '_')}/articles.json`;
  const topicFeedUrl = (name: string) =>
    `${origin}/wiki/category/${name.replace(/ /g, '_')}/feed.json`;
  const topicAtomUrl = (name: string) =>
    `${origin}/wiki/category/${name.replace(/ /g, '_')}/atom.xml`;
  const topicRssUrl = (name: string) =>
    `${origin}/wiki/category/${name.replace(/ /g, '_')}/rss.xml`;

  const body = JSON.stringify(
    {
      site: origin,
      statisticsJsonUrl: `${origin}/wiki/special/statistics.json`,
      ...stats,
      largestTopic: stats.largestTopic
        ? {
            ...stats.largestTopic,
            slug: topicSlug(stats.largestTopic.name),
            url: topicUrl(stats.largestTopic.name),
            articlesUrl: topicArticlesUrl(stats.largestTopic.name),
            // articlesJsonUrl is the same article-list link under the consistent
            // <name>JsonUrl key every other JSON companion uses (infoJsonUrl,
            // historyJsonUrl, backlinksJsonUrl, citeJsonUrl) and the category page
            // envelope exposes; articlesUrl is the lone outlier naming it without
            // the Json suffix and is kept for backwards compatibility.
            articlesJsonUrl: topicArticlesUrl(stats.largestTopic.name),
            feedUrl: topicFeedUrl(stats.largestTopic.name),
            // feedJsonUrl is the same JSON Feed link under the consistent
            // <name>JsonUrl key every other JSON companion uses; feedUrl is the
            // lone outlier naming it without the Json suffix and is kept for
            // backwards compatibility.
            feedJsonUrl: topicFeedUrl(stats.largestTopic.name),
            atomUrl: topicAtomUrl(stats.largestTopic.name),
            rssUrl: topicRssUrl(stats.largestTopic.name),
          }
        : null,
      topics: stats.topics.map((t: { name: string; count: number }) => ({
        ...t,
        slug: topicSlug(t.name),
        url: topicUrl(t.name),
        articlesUrl: topicArticlesUrl(t.name),
        // Same article-list link under the consistent <name>JsonUrl key the rest
        // of the API and the category page envelope use; articlesUrl (no Json
        // suffix) is the lone outlier, kept for backwards compatibility.
        articlesJsonUrl: topicArticlesUrl(t.name),
        feedUrl: topicFeedUrl(t.name),
        // Same JSON Feed link under the consistent <name>JsonUrl key the rest of
        // the API and the category page envelope use; feedUrl (no Json suffix)
        // is the lone outlier, kept for backwards compatibility.
        feedJsonUrl: topicFeedUrl(t.name),
        atomUrl: topicAtomUrl(t.name),
        rssUrl: topicRssUrl(t.name),
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
