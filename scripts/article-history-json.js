// Pure builder: no file I/O, no side effects. Converts the pre-loaded revision
// list into the canonical JSON shape for /wiki/<slug>/history.json, mirroring
// what history.astro renders.
export const buildArticleHistory = ({ slug, title, origin, revisions = [] }) => ({
  slug,
  title,
  url: `${origin}/wiki/${slug}/`,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
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
