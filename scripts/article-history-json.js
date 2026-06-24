// Pure builder: no file I/O, no side effects. Converts the pre-loaded revision
// list into the canonical JSON shape for /wiki/<slug>/history.json, mirroring
// what history.astro renders.
export const buildArticleHistory = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, referencesCount = 0, sectionCount = 0, wordCount = 0, revisions = [] }) => ({
  slug,
  title,
  summary: summary || null,
  url: `${origin}/wiki/${slug}/`,
  infoUrl: `${origin}/wiki/${slug}/info/`,
  infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  citeUrl: `${origin}/wiki/${slug}/cite/`,
  citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
  bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
  referencesUrl: `${origin}/wiki/${slug}/references.json`,
  relatedUrl: `${origin}/wiki/${slug}/related.json`,
  tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
  imageUrl: `${origin}/og/${slug}.png`,
  categories,
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  // The article's published outbound-reference count — the same figure
  // references.json exposes as `count` (via the shared getArticleReferences helper).
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure info.json exposes and the
  // article-page footer (mw-article-meta data-word-count) renders.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  revisionCount: revisions.length,
  firstEdited: revisions.length > 0 ? revisions[revisions.length - 1].date : null,
  lastEdited: revisions.length > 0 ? revisions[0].date : null,
  revisions: revisions.map((r) => ({
    sha: r.sha,
    date: r.date,
    authorName: r.authorName,
    message: r.message ?? '',
  })),
});
