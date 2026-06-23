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

export const buildArticleReferences = ({ slug, title, origin, references = [] }) => ({
  slug,
  title,
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
  count: references.length,
  references: references.map((link) => ({
    slug: link.slug,
    title: link.title,
    url: `${origin}/wiki/${link.slug}/`,
    historyUrl: `${origin}/wiki/${link.slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${link.slug}/history.json`,
  })),
});
