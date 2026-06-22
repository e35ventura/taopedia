// Build the machine-readable per-topic article list served at
// /wiki/category/<name>.articles.json. Kept as a pure function in scripts/
// (like allpages.js, statistics.js, most-linked.js, categories.js) so the Astro
// endpoint and the regression check share one source of truth without rendering
// the site.
//
// The HTML per-topic page (src/pages/wiki/category/[category].astro) lists the
// same articles for human display; this builder exposes the same membership as
// structured JSON for programmatic consumers (dashboards, monitoring, link
// rotators that want to subscribe to a topic's full membership, cross-referencing
// tools). The sort is the same sortPagesByTitle helper the HTML page uses, so
// numeric-suffixed article names ("Subnet 9" vs "Subnet 10") order numerically
// and the JSON and HTML surfaces never disagree on order, membership, or per-row
// fields.

import { sortPagesByTitle } from '../src/lib/title-sort.js';

export function buildCategoryArticles({ pages, categoryName, getPageSlug }) {
  if (!Array.isArray(pages) || !categoryName) return [];
  const filtered = pages.filter((page) =>
    Array.isArray(page?.data?.categories) && page.data.categories.includes(categoryName),
  );
  const sorted = sortPagesByTitle(filtered);
  return sorted.map((page) => ({
    slug: getPageSlug(page),
    title: page?.data?.title ?? '',
    summary: page?.data?.summary ?? '',
    url: `/wiki/${getPageSlug(page)}/`,
  }));
}