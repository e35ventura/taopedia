import type { APIRoute } from 'astro';
import { buildCategoryArticlesDocument } from '../../../../lib/category-articles.js';
import { buildCategoryDirectoryStaticPaths, getCategoryDirectoryEntry } from '../../../../lib/category-directory';

export const getStaticPaths = buildCategoryDirectoryStaticPaths;

// Machine-readable per-category membership list. Exposes the existing category
// hub article set as structured JSON using the same build artifacts that power
// the category feed and article metadata surfaces, while keeping the route
// strictly non-visual.
export const GET: APIRoute = async ({ props, site }) => {
  const { categoryName, categoryPath } = props as {
    categoryName: string;
    categoryPath: string;
  };
  const { articles } = await getCategoryDirectoryEntry(categoryName);
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
