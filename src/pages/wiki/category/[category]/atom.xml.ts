import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../../lib/article-history';
import { buildAtomFeed } from '../../../../../scripts/atom-feed.js';

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

  // Each category Atom feed mirrors the existing category RSS/JSON hub
  // membership while keeping the same canonical article URL/date derivation as
  // the site-wide Atom and JSON feeds.
  const items = pages
    .filter((page) => page.data.categories?.includes(categoryName))
    .map((page) => {
      const slug = getPageSlug(page);
      const history = historyForSlug(slug);
      return {
        title: page.data.title,
        url: `${origin}/wiki/${slug}/`,
        image: `${origin}/og/${slug}.png`,
        description: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        datePublished: history[history.length - 1]?.date ?? '',
        dateModified: history[0]?.date ?? '',
      };
    });

  const body = buildAtomFeed({
    siteUrl: `${origin}/`,
    feedPath: `/wiki/category/${categoryPath}/atom.xml`,
    homePageUrl: `${origin}/wiki/category/${categoryPath}/`,
    title: `Taopedia - ${categoryName} articles`,
    description: `Recently updated Taopedia articles in the ${categoryName} topic.`,
    items,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};
