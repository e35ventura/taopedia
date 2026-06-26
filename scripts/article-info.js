import { articleJsonCompanionUrls } from '../src/lib/wiki-article-path.js';

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
  ...articleJsonCompanionUrls(origin, slug),
  imageUrl: `${origin}/og/${slug}.png`,
  // Dedupe repeated frontmatter topics so Page-information JSON cannot list the
  // same category twice when an article's YAML repeats a topic tag.
  categories: [...new Set(categories)],
  // Coerce to a finite number — the same guard sectionCount/wordCount below and
  // the cite.json sibling already apply to every count field — so a non-finite
  // input can never serialize as JSON null where a consumer expects an integer.
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  // The article's published outbound-reference count — the complement of
  // incomingLinks, the same figure history.json / cite.json expose.
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure the article-page footer
  // (mw-article-meta data-word-count) renders, computed identically.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula the
  // article-page footer ("N min read") renders from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
});
