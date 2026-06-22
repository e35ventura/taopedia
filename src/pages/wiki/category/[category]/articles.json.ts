import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../../lib/article-history';
import { buildCategoryArticles } from '../../../../../scripts/category-articles.js';

// Machine-readable per-topic article list at
// /wiki/category/<name>.articles.json. Mirrors the HTML category hub page as
// structured JSON for programmatic consumers (dashboards, monitoring, link
// rotators that want a topic's full membership as JSON, cross-referencing tools),
// alongside the existing per-special JSON endpoints (allpages, categories,
// mostlinkedpages, recentchanges, statistics, subnets) and the per-article JSON
// endpoints (info, backlinks, history, cite). The computation is shared through
// scripts/category-articles.js (pure function), and the article order uses the
// same sortPagesByTitle helper the HTML hub page imports, so numeric-suffixed
// article names order numerically and the JSON and HTML surfaces never disagree.

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const categories = new Set<string>();

  for (const page of pages) {
    for (const category of page.data.categories ?? []) categories.add(category);
  }

  return [...categories]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((categoryName) => ({
      params: { category: categorySlug(categoryName) },
      props: { categoryName },
    }));
}

export const GET: APIRoute = async ({ site, props }) => {
  const { categoryName } = props as { categoryName: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const articles = buildCategoryArticles({ pages, categoryName, getPageSlug });

  const body = JSON.stringify(
    {
      site: origin,
      category: categoryName,
      url: `${origin}/wiki/category/${categorySlug(categoryName)}/`,
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