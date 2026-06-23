// Pure builder: no file I/O, no side effects. Converts the pre-loaded revision
// list into the canonical JSON shape for /wiki/<slug>/history.json, mirroring
// what history.astro renders.
export const buildArticleHistory = ({ slug, title, origin, revisions = [] }) => ({
  slug,
  title,
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
