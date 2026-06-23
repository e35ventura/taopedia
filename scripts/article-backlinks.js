// Pure builder: no file I/O, no side effects. Converts the pre-joined and
// pre-sorted backlinks list into the canonical JSON shape for
// /wiki/<slug>/backlinks.json, mirroring what backlinks.astro renders.
export const buildArticleBacklinks = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, revisionCount = 0, firstEdited = null, lastEdited = null, backlinks = [] }) => ({
  slug,
  title,
  summary: summary || null,
  url: `${origin}/wiki/${slug}/`,
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  infoUrl: `${origin}/wiki/${slug}/info/`,
  infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
  citeUrl: `${origin}/wiki/${slug}/cite/`,
  citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
  bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
  referencesUrl: `${origin}/wiki/${slug}/references.json`,
  relatedUrl: `${origin}/wiki/${slug}/related.json`,
  tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
  imageUrl: `${origin}/og/${slug}.png`,
  categories,
  // The article's own published inbound-link count — the same figure info.json
  // exposes (count here equals backlinks.length, the listed linking pages).
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  // The article's revision count (its commit-history length) — the same figure
  // info.json / history.json / cite.json expose on their envelopes.
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  // firstEdited / lastEdited bracket the article's revision history (oldest and
  // newest commit dates) — the same pair info.json / history.json / cite.json /
  // references.json / related.json expose; null when there's no history.
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  count: backlinks.length,
  backlinks: backlinks.map((link) => ({
    slug: link.slug,
    title: link.title,
    summary: link.summary || null,
    categories: Array.isArray(link.categories) ? link.categories : [],
    backlinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    url: `${origin}/wiki/${link.slug}/`,
    infoUrl: `${origin}/wiki/${link.slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${link.slug}/info.json`,
    backlinksUrl: `${origin}/wiki/${link.slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${link.slug}/backlinks.json`,
    historyUrl: `${origin}/wiki/${link.slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${link.slug}/history.json`,
    citeUrl: `${origin}/wiki/${link.slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${link.slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${link.slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${link.slug}/references.json`,
    relatedUrl: `${origin}/wiki/${link.slug}/related.json`,
    tocJsonUrl: `${origin}/wiki/${link.slug}/toc.json`,
    imageUrl: `${origin}/og/${link.slug}.png`,
  })),
});
