import type { APIRoute } from 'astro';
import { buildCategoryArticlesDocument, getCategoryArticles } from '../../../../lib/category-articles.js';
import { publishedInboundLinkCount } from '../../../../../scripts/most-linked.js';
import { historyForSlug } from '../../../../lib/article-history';

const categoriesModules = import.meta.glob('../../../../../public/data/categories.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const slugmapModules = import.meta.glob('../../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string; summary?: string }> }
>;
const backlinksModules = import.meta.glob('../../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;

const categoriesIndex = Object.values(categoriesModules)[0]?.default ?? {};
const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
);

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  return Object.keys(categoriesIndex)
    .sort()
    .map((categoryName) => ({
      params: { category: categorySlug(categoryName) },
      props: {
        categoryName,
        categoryPath: categorySlug(categoryName),
        articles: getCategoryArticles({ categoryName, categoriesIndex, slugMap }).map((article) => ({
          ...article,
          backlinks: publishedInboundLinkCount(backlinksData, article.slug, titleBySlug),
          lastEdited: historyForSlug(article.slug)[0]?.date ?? null,
        })),
      },
    }));
}

// Machine-readable per-category membership list. Exposes the existing category
// hub article set as structured JSON using the same build artifacts that power
// the category feed and article metadata surfaces, while keeping the route
// strictly non-visual.
export const GET: APIRoute = async ({ props, site }) => {
  const { categoryName, categoryPath, articles } = props as {
    categoryName: string;
    categoryPath: string;
    articles: Array<{ slug: string; title: string; summary: string; backlinks: number; lastEdited: string | null }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildCategoryArticlesDocument({ origin, categoryName, categoryPath, articles }),
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
