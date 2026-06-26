// Build the inbound-link ranking shared by every MostLinkedPages surface. Kept as
// a pure function in scripts/ (like statistics.js, opml.js, rss-feed.js) so the
// Astro surfaces and the regression check share one source of truth without
// rendering the site.
//
// BOTH the HTML Special:MostLinkedPages page (src/pages/wiki/special/mostlinkedpages.astro,
// for human display) and the machine-readable /wiki/special/mostlinkedpages.json
// endpoint (for programmatic consumers -- dashboards, monitoring, cross-referencing
// tools) rank through this builder, so the two surfaces can never disagree. It ranks
// published articles by how many OTHER published articles link to them (the same
// orphan-skipping, published-only inbound count "What links here" uses, with
// self-links excluded), count-desc then compareTitles(title) then raw slug code-unit
// order when titles tie -- so numeric-suffixed titles like "Subnet 9" vs "Subnet 10"
// still sort correctly, while same-title slug ties match references/backlinks ordering.

import { compareTitles } from '../src/lib/title-sort.js';

export function publishedInboundLinkCount(backlinks, slug, titleBySlug) {
  const links = backlinks?.[slug];
  // Count only inbound links from OTHER published articles. The backlink graph
  // (build-linkgraph.js) already drops self-links, but exclude `from === slug`
  // here too so the inbound count never counts an article's link to itself —
  // matching getArticleReferences, which excludes self on the outbound side.
  return (Array.isArray(links) ? links : []).filter((link) => link?.from !== slug && titleBySlug[link?.from]).length;
}

export function buildMostLinkedPages({ backlinks, titleBySlug }) {
  return Object.entries(backlinks ?? {})
    .filter(([slug]) => titleBySlug[slug])
    .map(([slug]) => ({
      slug,
      title: titleBySlug[slug],
      count: publishedInboundLinkCount(backlinks, slug, titleBySlug),
    }))
    .filter((entry) => entry.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
