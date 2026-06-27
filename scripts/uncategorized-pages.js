// Build the "Uncategorized pages" report served at
// /wiki/special/uncategorizedpages.json — the MediaWiki Special:UncategorizedPages
// maintenance report: published articles that carry NO topic category in their
// frontmatter. It is the categorization counterpart to Special:LonelyPages (zero
// INBOUND links) and Special:DeadEndPages (zero OUTBOUND links): a lonely page is
// one nobody links TO, a dead-end one that links to NOTHING, and an uncategorized
// page one that belongs to no topic hub — so it never appears under any
// /wiki/category/<topic>/ listing and is hard to discover by browsing or to place in
// the category feeds. Kept as a pure function in scripts/ (like lonely-pages.js /
// dead-end-pages.js / most-linked.js / wanted-pages.js) so the endpoint and the
// regression check share one source of truth without rendering the site.
//
// "Uncategorized" uses the SAME deduped topic set every category surface uses
// (uniqueFeedCategories): repeated frontmatter topics collapse and blank/whitespace
// entries are dropped, so an article whose only categories are duplicates of one
// topic still counts as categorized, while a page with an empty (or absent, or
// all-blank) categories array is uncategorized. Because the category hubs keep the
// articles WITH at least one topic and this keeps the ones with none, every published
// article is in exactly one bucket — the report and the categorized set partition the
// whole published set, the same partition contract lonely-pages.js documents against
// most-linked.js.

import { compareTitles } from '../src/lib/title-sort.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

// Reduce the published article set to the uncategorized pages (zero deduped topic
// categories), ordered by title with the shared compareTitles collation (so
// numeric-suffixed titles like "Subnet 9" vs "Subnet 10" read in human order) and a
// plain code-unit slug tiebreak when titles match (subnet_10 before subnet_9) — the
// SAME ordering buildLonelyPages / buildDeadEndPages / getArticleReferences /
// search-data use for same-title ties.
export function buildUncategorizedPages({ titleBySlug, categoriesBySlug }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      count: uniqueFeedCategories((categoriesBySlug ?? {})[slug]).length,
    }))
    .filter((entry) => entry.count === 0)
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map(({ slug, title }) => ({ slug, title }));
}
