// Pure builder: no file I/O, no side effects. Converts the pre-joined and
// pre-sorted backlinks list into the canonical JSON shape for
// /wiki/<slug>/backlinks.json, mirroring what backlinks.astro renders.
export const buildArticleBacklinks = ({ slug, title, origin, backlinks = [] }) => ({
  slug,
  title,
  url: `${origin}/wiki/${slug}/`,
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  count: backlinks.length,
  backlinks: backlinks.map((link) => ({
    slug: link.slug,
    title: link.title,
    url: `${origin}/wiki/${link.slug}/`,
    infoUrl: `${origin}/wiki/${link.slug}/info/`,
    backlinksUrl: `${origin}/wiki/${link.slug}/backlinks/`,
    historyUrl: `${origin}/wiki/${link.slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${link.slug}/history.json`,
    citeUrl: `${origin}/wiki/${link.slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${link.slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${link.slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${link.slug}/references.json`,
    relatedUrl: `${origin}/wiki/${link.slug}/related.json`,
  })),
});
