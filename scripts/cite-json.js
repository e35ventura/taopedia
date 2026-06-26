import { buildCitations, CITATION_META } from './citations.js';
import { articleJsonCompanionUrls, wikiArticleHref } from '../src/lib/wiki-article-path.js';

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
  const url = wikiArticleHref(origin, slug);
  const citations = buildCitations({ title, url, slug, date });

  return {
    title,
    slug,
    summary: summary || null,
    ...articleJsonCompanionUrls(origin, slug),
    imageUrl: `${origin}/og/${slug}.png`,
    // Dedupe repeated frontmatter topics so cite.json cannot list the same category twice.
    categories: [...new Set(categories)],
    incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
    revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
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
