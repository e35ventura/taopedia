import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildStatistics } from '../../../../scripts/statistics.js';

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
  const pages = await getCollection('pages');

  const stats = buildStatistics({
    pages,
    historyForSlug,
    getPageSlug,
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
            feedUrl: topicFeedUrl(stats.largestTopic.name),
            atomUrl: topicAtomUrl(stats.largestTopic.name),
            rssUrl: topicRssUrl(stats.largestTopic.name),
          }
        : null,
      topics: stats.topics.map((t: { name: string; count: number }) => ({
        ...t,
        slug: topicSlug(t.name),
        url: topicUrl(t.name),
        articlesUrl: topicArticlesUrl(t.name),
        feedUrl: topicFeedUrl(t.name),
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
