import type { APIRoute } from 'astro';
import { buildCategoryFeedStaticPaths } from '../../../../lib/category-feed-context';
import { buildAtomFeed } from '../../../../../scripts/atom-feed.js';

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

  const body = buildAtomFeed({
    siteUrl: `${origin}/`,
    feedPath: `/wiki/category/${categoryPath}/atom.xml`,
    homePageUrl: `${origin}/wiki/category/${categoryPath}/`,
    title: `Taopedia - ${categoryName} articles`,
    description: `Recently updated Taopedia articles in the ${categoryName} topic.`,
    items: items.map((item) => ({
      title: item.title,
      url: `${origin}/wiki/${item.slug}/`,
      image: `${origin}/og/${item.slug}.png`,
      description: item.summary,
      categories: item.categories,
      datePublished: item.datePublished,
      dateModified: item.dateModified,
    })),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};
