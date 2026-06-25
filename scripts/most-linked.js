// Build the machine-readable inbound-link ranking served at
// /wiki/special/mostlinkedpages.json. Kept as a pure function in scripts/ (like
// statistics.js, opml.js, rss-feed.js) so the Astro endpoint and the regression
// check share one source of truth without rendering the site.
//
// The HTML Special:MostLinkedPages page (src/pages/wiki/special/mostlinkedpages.astro)
// computes the same ranking inline for human display; this builder exposes it as
// structured JSON for programmatic consumers (dashboards, monitoring, cross-
// referencing tools). It ranks published articles by how many OTHER published
// articles link to them (the same orphan-skipping, published-only inbound count
// the HTML page and "What links here" use), count-desc then compareTitles(title)
// then compareTitles(slug) -- the SAME comparator the HTML page uses, so the JSON
// and HTML surfaces never disagree on numeric-suffixed names like "Subnet 9" vs
// "Subnet 10".

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
    .sort((a, b) => b.count - a.count || compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
}
