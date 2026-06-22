import { sortPagesByTitle } from '../src/lib/title-sort.js';

// Shared category-membership builder for the machine-readable article list at
// /wiki/category/<category>/articles.json. Reuses the same title sort helper as
// the HTML category hub so the JSON and HTML surfaces stay aligned.
export const buildCategoryArticles = ({ pages, categoryName, getPageSlug }) => {
  if (!Array.isArray(pages) || !categoryName || typeof getPageSlug !== 'function') return [];

  return sortPagesByTitle(pages.filter((page) => page.data.categories?.includes(categoryName))).map((page) => ({
    slug: getPageSlug(page),
    title: page.data.title,
    summary: page.data.summary ?? '',
    url: `/wiki/${getPageSlug(page)}/`,
  }));
};
