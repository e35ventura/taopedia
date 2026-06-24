import { buildCitations, CITATION_META } from './citations.js';

// Machine-readable companion to /wiki/<slug>/cite/. Serializes the same citation
// formats the HTML cite page renders, plus the article metadata envelope the
// sibling JSON endpoints (info.json, history.json, toc.json) expose. Pure
// function in scripts/ so cite.json.ts and the regression check share one
// source of truth (mirrors buildArticleInfo / buildArticleHistory).
export const buildCiteJson = ({
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
  date = '',
}) => {
  const url = `${origin}/wiki/${slug}/`;
  const citations = buildCitations({ title, url, slug, date });

  return {
    title,
    slug,
    summary: summary || null,
    url,
    citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
    citeUrl: `${origin}/wiki/${slug}/cite/`,
    bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
    historyUrl: `${origin}/wiki/${slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
    backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
    infoUrl: `${origin}/wiki/${slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
    tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
    referencesUrl: `${origin}/wiki/${slug}/references.json`,
    relatedUrl: `${origin}/wiki/${slug}/related.json`,
    // referencesJsonUrl / relatedJsonUrl are the consistently-named `*JsonUrl`
    // aliases for referencesUrl / relatedUrl, matching the infoJsonUrl /
    // historyJsonUrl / backlinksJsonUrl / citeJsonUrl / tocJsonUrl companions
    // this envelope already exposes. referencesUrl / relatedUrl kept for back-compat.
    referencesJsonUrl: `${origin}/wiki/${slug}/references.json`,
    relatedJsonUrl: `${origin}/wiki/${slug}/related.json`,
    imageUrl: `${origin}/og/${slug}.png`,
    categories,
    incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
    revisionCount,
    firstEdited: firstEdited ?? null,
    lastEdited: lastEdited ?? null,
    referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
    sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
    wordCount: Number.isFinite(wordCount) ? wordCount : 0,
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
    ...(date ? { date } : {}),
    ...CITATION_META,
    citations,
  };
};
