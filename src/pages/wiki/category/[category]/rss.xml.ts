import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, lastmodForSlug } from '../../../../lib/article-history';
import { buildRssFeed } from '../../../../../scripts/rss-feed.js';

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const categories = new Set<string>();

  for (const page of pages) {
    for (const category of page.data.categories ?? []) categories.add(category);
  }

  return [...categories].sort().map((categoryName) => {
    const categoryPath = categorySlug(categoryName);
    // Precomputed once per route in getStaticPaths — GET used to call
    // getCollection('pages') again for every category RSS feed (38 redundant
    // full collection reads per build). Matches category/atom.xml (#1128) and #1121.
    const items = pages
      .filter((page) => page.data.categories?.includes(categoryName))
      .map((page) => {
        const slug = getPageSlug(page);
        return {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
          date: lastmodForSlug(slug),
        };
      });

    return {
      params: { category: categorySlug(categoryName) },
      props: { categoryName, categoryPath, items },
    };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
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
    items: items.map((item) => ({
      title: item.title,
      url: `${origin}/wiki/${item.slug}/`,
      image: `${origin}/og/${item.slug}.png`,
      description: item.summary,
      categories: item.categories,
      date: item.date,
    })),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
