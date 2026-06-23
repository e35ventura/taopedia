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

export const buildArticleReferences = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, references = [] }) => ({
  slug,
  title,
  summary: summary || null,
  // The article's own published inbound-link count — the same figure info.json /
  // history.json / cite.json expose — so a consumer of references.json can see
  // the article's link popularity without a second fetch.
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
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
  count: references.length,
  references: references.map((link) => ({
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
