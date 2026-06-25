// Build the dead-end article list served at /wiki/special/deadendpages.json. Kept as
// a pure function in scripts/ (like orphan-pages.js, most-linked.js) so the Astro
// endpoint and the regression check share one source of truth without rendering
// the site.
//
// A "dead-end" article is a published page with zero outbound wiki references to
// OTHER published articles — the same published-only, self-excluding count each
// article's references.json uses via getArticleReferences. Per-article references
// endpoints expose this one slug at a time; this aggregates it site-wide for
// maintenance tooling.

import { compareTitles } from '../src/lib/title-sort.js';
import { getArticleReferences } from '../src/lib/article-references.js';

export function buildDeadEndPages({ linkGraph, titleBySlug }) {
  return Object.keys(titleBySlug ?? {})
    .filter((slug) => getArticleReferences({ slug, linkGraph, titleBySlug }).length === 0)
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
    }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
}
