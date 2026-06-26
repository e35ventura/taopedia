// Build the "Lonely pages" (orphaned articles) report served at
// /wiki/special/lonelypages.json — the MediaWiki Special:LonelyPages maintenance
// report, the exact complement of Special:MostLinkedPages: published articles that
// NO other published article links to (zero inbound links). Kept as a pure function
// in scripts/ (like most-linked.js / wanted-pages.js / statistics.js) so the endpoint
// and the regression check share one source of truth without rendering the site.
//
// "Lonely" uses the SAME published-only, self-excluded inbound count as
// Special:MostLinkedPages / What-links-here (publishedInboundLinkCount): an article is
// orphaned when no OTHER published article links to it. A self-link, or a link from an
// unpublished/draft source, never rescues a page from the report — matching how the
// inbound count is computed everywhere else. Because most-linked keeps count > 0 and
// this keeps count === 0, every published article lands in exactly one of the two
// reports, so the pair partitions the whole published set.

import { compareTitles } from '../src/lib/title-sort.js';
import { publishedInboundLinkCount } from './most-linked.js';

// Reduce the published article set to the orphans (zero published inbound links),
// ordered by title with the shared compareTitles collation (so numeric-suffixed
// titles like "Subnet 9" vs "Subnet 10" read in human order) and a plain code-unit
// slug tiebreak when titles match (subnet_10 before subnet_9), the SAME ordering
// buildMostLinkedPages / getArticleReferences / search-data use for same-title ties.
export function buildLonelyPages({ titleBySlug, backlinks }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      count: publishedInboundLinkCount(backlinks ?? {}, slug, titleBySlug),
    }))
    .filter((entry) => entry.count === 0)
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map(({ slug, title }) => ({ slug, title }));
}
