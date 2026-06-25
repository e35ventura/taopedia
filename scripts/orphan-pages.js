// Build the orphan-article list served at /wiki/special/orphanpages.json. Kept as
// a pure function in scripts/ (like most-linked.js, broken-links.js) so the
// Astro endpoint and the regression check share one source of truth without
// rendering the site.
//
// An "orphan" is a published article with zero inbound links from OTHER
// published articles — the same published-only, self-link-excluding count
// Special:MostLinkedPages and per-article backlinks.json use. MostLinkedPages
// drops zero-inbound articles from its ranking; this endpoint surfaces them for
// maintenance tooling that needs to find disconnected content.

import { compareTitles } from '../src/lib/title-sort.js';
import { publishedInboundLinkCount } from './most-linked.js';

export function buildOrphanPages({ backlinks, titleBySlug }) {
  return Object.keys(titleBySlug ?? {})
    .filter((slug) => publishedInboundLinkCount(backlinks, slug, titleBySlug) === 0)
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
    }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
}
