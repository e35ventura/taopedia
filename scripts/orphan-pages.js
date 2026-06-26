// Build the orphan-article list served at /wiki/special/orphanpages.json. Kept as
// a pure function in scripts/ (like most-linked.js) so the Astro endpoint and
// the regression check share one source of truth without rendering the site.
//
// An "orphan" is a published article with zero inbound links from OTHER
// published articles — the same published-only, self-link-excluding count
// Special:MostLinkedPages and per-article backlinks.json use.

import { compareTitles } from '../src/lib/title-sort.js';
import { publishedInboundLinkCount } from './most-linked.js';

export function buildOrphanPages({ backlinks, titleBySlug }) {
  return Object.keys(titleBySlug ?? {})
    .filter((slug) => publishedInboundLinkCount(backlinks, slug, titleBySlug) === 0)
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
    }))
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
