// Build the no-related-pages article list served at /wiki/special/norelatedpages.json.
// Kept as a pure function in scripts/ so the Astro endpoint and the regression
// check share one source of truth without rendering the site.
//
// A "no-related" article is a published page for which getRelatedPages returns
// an empty list — the same helper related.json and the article-page related
// block use. check-related-json.js already expects at least one such article
// for empty-state coverage; this endpoint aggregates that signal site-wide.

import { compareTitles } from '../src/lib/title-sort.js';
import { getRelatedPages } from '../src/lib/related-pages.ts';

export function buildNoRelatedPages({
  slugMap,
  categoriesIndex,
  backlinks,
  outgoing,
  titleBySlug,
  publishedSlugs,
}) {
  const slugs = publishedSlugs instanceof Set ? [...publishedSlugs] : Object.keys(titleBySlug ?? {});
  return slugs
    .filter((slug) => {
      const related = getRelatedPages({
        slug,
        slugMap,
        categoriesIndex,
        backlinks,
        outgoing,
        publishedSlugs: publishedSlugs instanceof Set ? publishedSlugs : new Set(slugs),
        titleBySlug,
      });
      return related.length === 0;
    })
    .map((slug) => ({
      slug,
      title: titleBySlug[slug] ?? slugMap[slug]?.title ?? slug,
    }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
}
