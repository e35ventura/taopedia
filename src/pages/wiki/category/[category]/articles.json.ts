import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../../lib/article-history';
import { buildCategoryArticles } from '../../../../../scripts/category-articles.js';

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

// Machine-readable per-category membership list at
// /wiki/category/<category>/articles.json. Mirrors the existing category hub as
// structured JSON for consumers that need the topic membership itself rather
// than the chronological feed views.
export const GET: APIRoute = async ({ site, props }) => {
  const { categoryName } = props as { categoryName: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const categoryPath = categorySlug(categoryName);
  const pages = await getCollection('pages');
  const articles = buildCategoryArticles({ pages, categoryName, getPageSlug });

  const body = JSON.stringify(
    {
      site: origin,
      category: categoryName,
      url: `${origin}/wiki/category/${categoryPath}/`,
      count: articles.length,
      articles: articles.map((article) => ({
        slug: article.slug,
        title: article.title,
        summary: article.summary || null,
        url: `${origin}${article.url}`,
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
