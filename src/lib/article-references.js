import { compareTitles } from './title-sort.js';

export const getArticleReferences = ({ slug, linkGraph = {}, titleBySlug = {} }) => {
  const links = Array.isArray(linkGraph[slug]) ? linkGraph[slug] : [];
  const seen = new Set();
  const references = [];

  for (const link of links) {
    const target = typeof link?.target === 'string' ? link.target : '';
    if (!target || target === slug || !titleBySlug[target] || seen.has(target)) continue;

    seen.add(target);
    references.push({ slug: target, title: titleBySlug[target] });
  }

  return references.sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
};

export const buildArticleReferences = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, revisionCount = 0, firstEdited = null, lastEdited = null, sectionCount = 0, wordCount = 0, references = [] }) => ({
  slug,
  title,
  summary: summary || null,
  url: `${origin}/wiki/${slug}/`,
  referencesUrl: `${origin}/wiki/${slug}/references.json`,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  infoUrl: `${origin}/wiki/${slug}/info/`,
  infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
  citeUrl: `${origin}/wiki/${slug}/cite/`,
  citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
  bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
  relatedUrl: `${origin}/wiki/${slug}/related.json`,
  tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
  imageUrl: `${origin}/og/${slug}.png`,
  categories,
  // The article's own published inbound-link count — the same figure info.json /
  // history.json / cite.json expose on their envelopes (via the shared helper).
  incomingLinks,
  // The article's revision count (its commit-history length) — the same figure
  // info.json / history.json / cite.json expose on their envelopes.
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  // The article's first/last revision dates (history is newest-first) — the same
  // firstEdited/lastEdited pair info.json and history.json expose.
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  // The article's rendered table-of-contents section total — the same count
  // toc.json exposes for this article.
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure info.json / history.json
  // expose and the article-page footer (mw-article-meta data-word-count) renders.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // The ~200-wpm reading-time estimate derived from wordCount — the same figure
  // info.json / history.json / cite.json / toc.json expose and the article-page
  // footer ("N min read") renders.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  count: references.length,
  references: references.map((link) => ({
    slug: link.slug,
    title: link.title,
    summary: link.summary || null,
    categories: Array.isArray(link.categories) ? link.categories : [],
    backlinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // The referenced article's published outbound-reference count — the same
    // figure its own history.json / cite.json / info.json / references.json
    // envelope exposes, so consumers can compare both inbound and outbound link
    // totals across the referenced set without a second fetch.
    referencesCount: Number.isFinite(link.referencesCount) ? link.referencesCount : 0,
    // The referenced article's table-of-contents section count — the same figure
    // its own toc.json / info.json expose and allpages.json / subnets.json
    // expose per directory entry.
    sectionCount: Number.isFinite(link.sectionCount) ? link.sectionCount : 0,
    // The referenced article's body word count — the same figure info.json /
    // history.json expose and allpages.json / subnets.json expose per entry.
    wordCount: Number.isFinite(link.wordCount) ? link.wordCount : 0,
    // The referenced article's ~200-wpm reading-time estimate — the same figure
    // info.json exposes and related.json's per-entry related[] already expose.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(link.wordCount) ? link.wordCount : 0) / 200)),
    // The referenced article's revision-history summary — the same trio
    // info.json and history.json expose per article.
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
