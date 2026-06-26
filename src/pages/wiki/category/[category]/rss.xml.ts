import type { APIRoute } from 'astro';
import { buildCategoryFeedStaticPaths } from '../../../../lib/category-feed-context';
import { mapCategoryFeedRssItems } from '../../../../lib/category-feed-items.js';
import { buildRssFeed } from '../../../../../scripts/rss-feed.js';

export async function getStaticPaths() {
  return buildCategoryFeedStaticPaths();
}

export const GET: APIRoute = ({ site, props }) => {
  const { categoryName, categoryPath, items } = props as {
    categoryName: string;
    categoryPath: string;
    items: Array<{
      slug: string;
      title: string;
      summary: string;
      categories: string[];
      date: string;
    }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = buildRssFeed({
    siteUrl: `${origin}/`,
    feedPath: `/wiki/category/${categoryPath}/rss.xml`,
    channelLink: `${origin}/wiki/category/${categoryPath}/`,
    title: `Taopedia - ${categoryName} articles`,
    description: `Recently updated Taopedia articles in the ${categoryName} topic.`,
    items: mapCategoryFeedRssItems(origin, items),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
