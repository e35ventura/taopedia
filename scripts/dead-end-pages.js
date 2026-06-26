// Build the "Dead-end pages" report served at /wiki/special/deadendpages.json —
// the MediaWiki Special:DeadEndPages maintenance report: published articles that
// link OUT to no other published article (zero outbound references). It is the
// navigation counterpart to Special:LonelyPages (zero INBOUND links): a lonely page
// is one nobody links TO, a dead-end page is one that links to NOTHING — a reading
// cul-de-sac an editor should wire into the link graph. Kept as a pure function in
// scripts/ (like lonely-pages.js / most-linked.js / wanted-pages.js) so the endpoint
// and the regression check share one source of truth without rendering the site.
//
// "Dead-end" uses the SAME published-only, self-excluded OUTBOUND count as
// references.json / info.json (getArticleReferences): a self-link, or a link to an
// unpublished/missing target (a red link), never counts as a real outbound reference.
// Because references.json keeps the articles WITH outbound links and this keeps the
// ones with none, every published article is in exactly one bucket — so the report
// and the with-references set partition the whole published set.

import { compareTitles } from '../src/lib/title-sort.js';
import { getArticleReferences } from '../src/lib/article-references.js';

// Reduce the published article set to the dead-ends (zero published outbound
// references), ordered by title with the shared compareTitles collation (so
// numeric-suffixed titles like "Subnet 9" vs "Subnet 10" read in human order) and a
// plain code-unit slug tiebreak when titles match (subnet_10 before subnet_9) — the
// SAME ordering getArticleReferences / buildMostLinkedPages / search-data use for ties.
export function buildDeadEndPages({ titleBySlug, linkGraph }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      count: getArticleReferences({ slug, linkGraph: linkGraph ?? {}, titleBySlug }).length,
    }))
    .filter((entry) => entry.count === 0)
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map(({ slug, title }) => ({ slug, title }));
}
