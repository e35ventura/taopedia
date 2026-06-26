import type { APIRoute } from 'astro';
import { buildCategoryFeedStaticPaths } from '../../../../lib/category-feed-context';
import { mapCategoryFeedJsonAtomItems } from '../../../../lib/category-feed-items.js';
import { buildJsonFeed } from '../../../../../scripts/json-feed.js';

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
      datePublished: string;
      dateModified: string;
    }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = buildJsonFeed({
    siteUrl: `${origin}/`,
    feedPath: `/wiki/category/${categoryPath}/feed.json`,
    homePageUrl: `${origin}/wiki/category/${categoryPath}/`,
    title: `Taopedia - ${categoryName} articles`,
    description: `Recently updated Taopedia articles in the ${categoryName} topic.`,
    items: mapCategoryFeedJsonAtomItems(origin, items),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
};
