import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, lastmodForSlug } from '../../../../lib/article-history';
import { buildRssFeed } from '../../../../../scripts/rss-feed.js';

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  // Group each article under every category it belongs to in a single pass.
  // The per-category RSS feed below then reads its members by map lookup
  // instead of re-scanning the whole collection with pages.filter() once per
  // category — the old shape was O(categories × pages) (38 × 350 here);
  // grouping once is O(pages) plus the membership pushes. membersByCategory
  // preserves collection order, so each feed's item order is unchanged. The
  // same grouping category/atom.xml (#1192) and category/feed.json (#1195) use.
  // lastmodBySlug still caches each categorized article's history lookup once
  // (an article in N categories was otherwise recomputing it per feed).
  const membersByCategory = new Map<string, typeof pages>();
  const lastmodBySlug: Record<string, string> = {};

  for (const page of pages) {
    const slug = getPageSlug(page);
    const pageCategories = page.data.categories ?? [];
    if (pageCategories.length > 0) lastmodBySlug[slug] = lastmodForSlug(slug);
    for (const category of pageCategories) {
      const members = membersByCategory.get(category) ?? [];
      members.push(page);
      membersByCategory.set(category, members);
    }
  }

  return [...membersByCategory.keys()].sort().map((categoryName) => {
    const categoryPath = categorySlug(categoryName);
    const items = (membersByCategory.get(categoryName) ?? [])
      .map((page) => {
        const slug = getPageSlug(page);
        return {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
          date: lastmodBySlug[slug] ?? '',
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
