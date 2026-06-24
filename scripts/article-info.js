export const buildArticleInfo = ({
  title,
  slug,
  origin,
  summary = '',
  categories = [],
  incomingLinks = 0,
  referencesCount = 0,
  sectionCount = 0,
  wordCount = 0,
  revisionCount = 0,
  firstEdited = null,
  lastEdited = null,
}) => ({
  title,
  slug,
  summary: summary || null,
  url: `${origin}/wiki/${slug}/`,
  categories,
  incomingLinks,
  // The article's published outbound-reference count — the complement of
  // incomingLinks, the same figure history.json / cite.json expose.
  referencesCount,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure the article-page footer
  // (mw-article-meta data-word-count) renders, computed identically.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula the
  // article-page footer ("N min read") renders from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  citeUrl: `${origin}/wiki/${slug}/cite/`,
  citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
  bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
  infoUrl: `${origin}/wiki/${slug}/info/`,
  infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  referencesUrl: `${origin}/wiki/${slug}/references.json`,
  // referencesJsonUrl / relatedJsonUrl are the same cross-links under the
  // consistent <name>JsonUrl key every other JSON companion uses on this envelope
  // (infoJsonUrl, historyJsonUrl, backlinksJsonUrl, citeJsonUrl, tocJsonUrl).
  // referencesUrl / relatedUrl were the only two lacking the Json suffix; they
  // are kept for backwards compatibility.
  referencesJsonUrl: `${origin}/wiki/${slug}/references.json`,
  relatedUrl: `${origin}/wiki/${slug}/related.json`,
  relatedJsonUrl: `${origin}/wiki/${slug}/related.json`,
  tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
  imageUrl: `${origin}/og/${slug}.png`,
  revisionCount,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
});
