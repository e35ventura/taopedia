import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../../lib/article-history';
import { buildJsonFeed } from '../../../../../scripts/json-feed.js';

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const categories = new Set<string>();
  // Cache each categorized article's history once. An article in N categories
  // was otherwise having historyForSlug recomputed once per category feed; the
  // map only depends on the article slug, so build it a single time here.
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};

  for (const page of pages) {
    const slug = getPageSlug(page);
    const pageCategories = page.data.categories ?? [];
    if (pageCategories.length > 0) historyBySlug[slug] = historyForSlug(slug);
    for (const category of pageCategories) categories.add(category);
  }

  return [...categories].sort().map((categoryName) => {
    const categoryPath = categorySlug(categoryName);
    // Precomputed once per route in getStaticPaths — GET used to call
    // getCollection('pages') again for every category JSON feed (38 redundant
    // full collection reads per build). Matches category/atom.xml (#1128) and
    // category/rss.xml (#1131).
    const items = pages
      .filter((page) => page.data.categories?.includes(categoryName))
      .map((page) => {
        const slug = getPageSlug(page);
        const history = historyBySlug[slug] ?? [];
        return {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
          datePublished: history[history.length - 1]?.date ?? '',
          dateModified: history[0]?.date ?? '',
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
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
};
