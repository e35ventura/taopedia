// Build the "Dead-end pages" report served at /wiki/special/deadendpages.json —
// the MediaWiki Special:DeadendPages maintenance report, the outbound-side mirror
// of Special:LonelyPages: published articles that link OUT to no other published
// article (zero outbound references). Kept as a pure function in scripts/ (like
// lonely-pages.js / most-linked.js / wanted-pages.js / statistics.js) so the
// endpoint and the regression check share one source of truth without rendering
// the site.
//
// Where LonelyPages uses the published-only INBOUND count (publishedInboundLinkCount
// over backlinks.json), a page is "dead-end" by the published-only OUTBOUND count:
// getArticleReferences over linkgraph.json, the SAME join the references.json /
// info.json referencesCount uses. That join already drops self-links and links to
// unpublished/draft targets, so an article whose only links point at itself or at
// non-existent pages is still a dead-end — matching how the outbound count is
// computed everywhere else. The two reports are independent (LonelyPages looks at
// who links IN, DeadendPages at who is linked-TO): a page can be in both (an island)
// or in neither (well-connected both ways).

import { compareTitles } from '../src/lib/title-sort.js';
import { getArticleReferences } from '../src/lib/article-references.js';

// Reduce the published article set to the dead-ends (zero published outbound
// references), ordered by title with the shared compareTitles collation (so
// numeric-suffixed titles like "Subnet 9" vs "Subnet 10" read in human order) and
// a plain code-unit slug tiebreak when titles match (subnet_10 before subnet_9),
// the SAME ordering buildLonelyPages / getArticleReferences / search-data use.
export function buildDeadEndPages({ titleBySlug, linkGraph }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      count: getArticleReferences({ slug, linkGraph: linkGraph ?? {}, titleBySlug: titleBySlug ?? {} }).length,
    }))
    .filter((entry) => entry.count === 0)
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map(({ slug, title }) => ({ slug, title }));
}
