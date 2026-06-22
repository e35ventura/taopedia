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

  return [...categories].sort().map((categoryName) => ({
    params: { category: categorySlug(categoryName) },
    props: { categoryName },
  }));
}

export const GET: APIRoute = async ({ site, props }) => {
  const { categoryName } = props as { categoryName: string };
  const categoryPath = categorySlug(categoryName);
  const base = site ?? new URL('https://taopedia.org');
  const origin = base.origin;
  const pages = await getCollection('pages');

  // Each category feed mirrors the existing category hub membership but keeps
  // the same canonical article URL/date derivation as the site-wide RSS feed.
  const items = pages
    .filter((page) => page.data.categories?.includes(categoryName))
    .map((page) => {
      const slug = getPageSlug(page);
      return {
        title: page.data.title,
        url: `${origin}/wiki/${slug}/`,
        image: `${origin}/og/${slug}.png`,
        description: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        date: lastmodForSlug(slug),
      };
    });

  const body = buildRssFeed({
    siteUrl: `${origin}/`,
    feedPath: `/wiki/category/${categoryPath}/rss.xml`,
    channelLink: `${origin}/wiki/category/${categoryPath}/`,
    title: `Taopedia - ${categoryName} articles`,
    description: `Recently updated Taopedia articles in the ${categoryName} topic.`,
    items,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
