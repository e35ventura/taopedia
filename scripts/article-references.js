// Build the machine-readable per-article outbound-link list served at
// /wiki/<slug>/references.json. Kept as a pure function in scripts/ (like
// article-info.js, article-backlinks.js, article-history-json.js, citations.js)
// so the Astro endpoint and the regression check share one source of truth
// without rendering the site.
//
// The HTML per-article "What links here" / backlinks page
// (src/pages/wiki/[...slug]/backlinks.astro) and its JSON counterpart
// (backlinks.json.ts) expose INBOUND links — which other articles link to this
// one. This builder is the OUTBOUND counterpart: which articles this article
// links to (the wiki-style "References" / "See also" listing a glossary entry
// would have at the end of its body). The HTML article page itself renders
// outbound links inline; this endpoint exposes the same outbound set as
// structured JSON for programmatic consumers (citation tools, link rotators,
// knowledge-graph builders, cross-referencing tools that want a per-article
// outbound index rather than re-parsing the HTML body).
//
// The outbound set is read from the existing public/data/linkgraph.json
// (built by scripts/build-linkgraph.js, the same source every other per-article
// JSON endpoint uses), so no new pipeline is introduced. Self-references
// (linkgraph entries that point back at the source slug) are excluded so the
// output never claims an article references itself. Targets that resolve to a
// published article (slugmap join) are kept; targets that did not resolve to a
// known article are skipped — the same published-only join
// backlinks.json.ts uses for inbound links. Order is compareTitles(title) then
// compareTitles(slug) — the same comparator backlinks.json.ts uses, so the two
// surfaces never disagree on tiebreak semantics.

import { compareTitles } from '../src/lib/title-sort.js';

export function buildArticleReferences({ slug, title, origin, links, titleBySlug }) {
  const safeLinks = Array.isArray(links) ? links : [];
  const references = safeLinks
    .map((link) => ({ slug: link?.slug ?? '', text: link?.text ?? '' }))
    .filter((link) => link.slug && link.slug !== slug && titleBySlug[link.slug])
    .map((link) => ({
      slug: link.slug,
      title: titleBySlug[link.slug],
      text: link.text,
      url: `${origin}/wiki/${link.slug}/`,
    }))
    .sort(
      (a, b) =>
        compareTitles(a.title, b.title) ||
        compareTitles(a.slug, b.slug) ||
        a.text.localeCompare(b.text, 'en', { numeric: true }),
    );

  return {
    slug,
    title,
    url: `${origin}/wiki/${slug}/`,
    referencesUrl: `${origin}/wiki/${slug}/references/`,
    count: references.length,
    references,
  };
}