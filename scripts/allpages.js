// Build the machine-readable article directory served at
// /wiki/special/allpages.json. Kept as a thin wrapper around the existing
// `sortPagesByTitle` helper (src/lib/title-sort.js), the same helper the HTML
// Special:AllPages page (src/pages/wiki/special/allpages.astro) imports, so
// the JSON and HTML surfaces never disagree on article order — both call the
// same function with the same content collection and the same code-unit
// tiebreak the rest of the build uses.
//
// Pure: no I/O side effects, no environment reads, no clock — the same input
// always produces the same output, so the regression check can pin a specific
// expected directory.

import { sortPagesByTitle } from '../src/lib/title-sort.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

export function buildAllPages({ pages, getPageSlug, origin }) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const base = String(origin ?? '').replace(/\/+$/, '');
  // Reuse the exact same sort the HTML page uses. The helper breaks title
  // ties with a plain code-unit id comparison (NOT localeCompare) so the
  // order does not depend on the build machine's locale — same contract the
  // HTML page and the regression check rely on.
  const sorted = sortPagesByTitle(pages);
  return sorted.map((page) => ({
    slug: getPageSlug(page),
    title: page?.data?.title ?? '',
    summary: page?.data?.summary ?? '',
    url: `${base}/wiki/${getPageSlug(page)}/`,
    categories: Array.isArray(page?.data?.categories) ? page.data.categories : [],
  }));
}

// Enrich one directory row with the per-article metadata and cross-links the
// allpages.json endpoint exposes. Pure function so the Astro route and the
// regression check share one source of truth (mirrors buildCategoryArticlesDocument).
export function enrichAllPagesArticle({
  article,
  origin,
  titleBySlug,
  wordCountBySlug,
  sectionCountBySlug,
  backlinksData,
  linkgraphData,
  historyForSlug,
}) {
  const history = historyForSlug(article.slug);
  const inboundLinks = publishedInboundLinkCount(backlinksData, article.slug, titleBySlug);
  const wordCount = wordCountBySlug[article.slug] ?? 0;

  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary || null,
    url: article.url,
    infoUrl: `${origin}/wiki/${article.slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${article.slug}/info.json`,
    backlinksUrl: `${origin}/wiki/${article.slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${article.slug}/backlinks.json`,
    historyUrl: `${origin}/wiki/${article.slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${article.slug}/history.json`,
    citeUrl: `${origin}/wiki/${article.slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${article.slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${article.slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${article.slug}/references.json`,
    referencesJsonUrl: `${origin}/wiki/${article.slug}/references.json`,
    relatedUrl: `${origin}/wiki/${article.slug}/related.json`,
    relatedJsonUrl: `${origin}/wiki/${article.slug}/related.json`,
    tocJsonUrl: `${origin}/wiki/${article.slug}/toc.json`,
    imageUrl: `${origin}/og/${article.slug}.png`,
    categories: article.categories,
    backlinks: inboundLinks,
    incomingLinks: inboundLinks,
    revisionCount: history.length,
    firstEdited: history[history.length - 1]?.date ?? null,
    lastEdited: history[0]?.date ?? null,
    referencesCount: getArticleReferences({ slug: article.slug, linkGraph: linkgraphData, titleBySlug }).length,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    sectionCount: sectionCountBySlug[article.slug] ?? 0,
  };
}

export function buildAllPagesDocument({ origin, articles = [] }) {
  return {
    site: origin,
    allpagesJsonUrl: `${origin}/wiki/special/allpages.json`,
    count: articles.length,
    articles,
  };
}
