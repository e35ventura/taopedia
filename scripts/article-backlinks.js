// Pure builder: no file I/O, no side effects. Converts the pre-joined and
// pre-sorted backlinks list into the canonical JSON shape for
// /wiki/<slug>/backlinks.json, mirroring what backlinks.astro renders.
export const buildArticleBacklinks = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, referencesCount = 0, sectionCount = 0, wordCount = 0, revisionCount = 0, firstEdited = null, lastEdited = null, backlinks = [] }) => ({
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
  // The article's published OUTBOUND reference count — the complement of
  // incomingLinks, the same figure info.json / history.json / cite.json /
  // related.json expose on their envelopes.
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure info.json / history.json
  // expose and the article-page footer (mw-article-meta data-word-count) renders.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula
  // info.json exposes and the article-page footer ("N min read") renders
  // from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  // The article's revision count (its commit-history length) — the same figure
  // info.json / history.json / cite.json expose on their envelopes.
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  // The article's first/last revision dates (history is newest-first) — the same
  // firstEdited/lastEdited pair info.json and history.json expose.
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  count: backlinks.length,
  backlinks: backlinks.map((link) => ({
    slug: link.slug,
    title: link.title,
    summary: link.summary || null,
    categories: Array.isArray(link.categories) ? link.categories : [],
    backlinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // The linking article's published OUTBOUND reference count — the inbound
    // complement of backlinks, the same per-entry referencesCount allpages.json
    // and subnets.json expose for each directory entry.
    referencesCount: Number.isFinite(link.referencesCount) ? link.referencesCount : 0,
    // The linking article's body word count — the same figure info.json /
    // history.json expose and allpages.json / subnets.json expose per entry.
    wordCount: Number.isFinite(link.wordCount) ? link.wordCount : 0,
    // The linking article's ~200-wpm reading-time estimate derived from wordCount —
    // the same figure info.json / allpages.json / subnets.json expose.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(link.wordCount) ? link.wordCount : 0) / 200)),
    // The linking article's revision-history summary — the same trio info.json
    // and history.json expose per article, so a consumer scanning the backlink
    // list can gauge each linking page's age and edit activity without a fetch.
    revisionCount: Number.isFinite(link.revisionCount) ? link.revisionCount : 0,
    firstEdited: link.firstEdited ?? null,
    lastEdited: link.lastEdited ?? null,
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
