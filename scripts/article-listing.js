// Shared helpers for the special listing JSON endpoints (allpages.json,
// mostlinkedpages.json, subnets.json, recentchanges.json). Centralizes the
// per-slug metadata maps those endpoints used to rebuild independently inside
// GET (getCollection + render + historyForSlug per article). Pure functions in
// scripts/ so the Astro routes and regression checks share one source of truth
// (mirrors buildArticleInfo / buildCiteJson / buildCategoryArticlesDocument).

import { getArticleReferences } from '../src/lib/article-references.js';
import { publishedInboundLinkCount } from './most-linked.js';

// Build once per listing endpoint in getStaticPaths: wordCount, sectionCount,
// and revision stats for every published article. Renders each page exactly once
// to derive sectionCount from headings; reads history once per slug.
export async function buildArticleSlugMetadata({
  pages,
  getPageSlug,
  historyForSlug,
  renderPage,
  getArticleToc,
}) {
  const titleBySlug = {};
  const categoriesBySlug = {};
  const summaryBySlug = {};
  const wordCountBySlug = {};
  const sectionCountBySlug = {};
  const revisionStatsBySlug = {};
  const pageBySlug = {};

  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    categoriesBySlug[slug] = page.data.categories ?? [];
    summaryBySlug[slug] = page.data.summary ?? '';
    pageBySlug[slug] = page;
    wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  }

  await Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const { headings } = await renderPage(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );

  for (const slug of Object.keys(titleBySlug)) {
    const history = historyForSlug(slug);
    revisionStatsBySlug[slug] = {
      revisionCount: history.length,
      firstEdited: history[history.length - 1]?.date ?? null,
      lastEdited: history[0]?.date ?? null,
    };
  }

  return {
    titleBySlug,
    categoriesBySlug,
    summaryBySlug,
    wordCountBySlug,
    sectionCountBySlug,
    revisionStatsBySlug,
    pageBySlug,
  };
}

// Per-row link-degree and content metrics shared by every listing entry shape.
export function articleListingMetricsForSlug({
  slug,
  metadata,
  backlinksData,
  linkgraphData,
  inboundLinks,
}) {
  const { titleBySlug, wordCountBySlug, sectionCountBySlug, revisionStatsBySlug } = metadata;
  const wordCount = wordCountBySlug[slug] ?? 0;
  const stats = revisionStatsBySlug[slug] ?? { revisionCount: 0, firstEdited: null, lastEdited: null };
  const links = inboundLinks ?? publishedInboundLinkCount(backlinksData, slug, titleBySlug);

  return {
    backlinks: links,
    incomingLinks: links,
    referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
    revisionCount: stats.revisionCount,
    firstEdited: stats.firstEdited,
    lastEdited: stats.lastEdited,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    sectionCount: sectionCountBySlug[slug] ?? 0,
  };
}

// Canonical per-article URL block every listing JSON endpoint exposes per row.
export function formatArticleListingEntry({ origin, slug, title, summary, categories, metrics }) {
  return {
    slug,
    title,
    summary: summary || null,
    url: `${origin}/wiki/${slug}/`,
    infoUrl: `${origin}/wiki/${slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
    backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
    historyUrl: `${origin}/wiki/${slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
    citeUrl: `${origin}/wiki/${slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${slug}/references.json`,
    relatedUrl: `${origin}/wiki/${slug}/related.json`,
    // referencesJsonUrl / relatedJsonUrl are the same companion links under the
    // consistent <name>JsonUrl key every other JSON companion uses here
    // (infoJsonUrl, historyJsonUrl, backlinksJsonUrl, citeJsonUrl, tocJsonUrl).
    // referencesUrl / relatedUrl were the only two companions lacking the Json
    // suffix; they are kept for backwards compatibility.
    referencesJsonUrl: `${origin}/wiki/${slug}/references.json`,
    relatedJsonUrl: `${origin}/wiki/${slug}/related.json`,
    tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
    imageUrl: `${origin}/og/${slug}.png`,
    categories: Array.isArray(categories) ? categories : [],
    backlinks: Number.isFinite(metrics.backlinks) ? metrics.backlinks : 0,
    incomingLinks: Number.isFinite(metrics.incomingLinks) ? metrics.incomingLinks : 0,
    referencesCount: Number.isFinite(metrics.referencesCount) ? metrics.referencesCount : 0,
    revisionCount: Number.isFinite(metrics.revisionCount) ? metrics.revisionCount : 0,
    firstEdited: metrics.firstEdited ?? null,
    lastEdited: metrics.lastEdited ?? null,
    wordCount: Number.isFinite(metrics.wordCount) ? metrics.wordCount : 0,
    readingMinutes: Number.isFinite(metrics.readingMinutes)
      ? metrics.readingMinutes
      : Math.max(1, Math.ceil((Number.isFinite(metrics.wordCount) ? metrics.wordCount : 0) / 200)),
    sectionCount: Number.isFinite(metrics.sectionCount) ? metrics.sectionCount : 0,
  };
}

export function buildRecentChangesDocument({
  origin,
  limit,
  changes = [],
  dateRange = { newest: '', oldest: '' },
}) {
  return {
    site: origin,
    recentchangesJsonUrl: `${origin}/wiki/special/recentchanges.json`,
    feedUrl: `${origin}/wiki/special/recentchanges/feed.json`,
    feedJsonUrl: `${origin}/wiki/special/recentchanges/feed.json`,
    atomUrl: `${origin}/wiki/special/recentchanges/atom.xml`,
    rssUrl: `${origin}/wiki/special/recentchanges/rss.xml`,
    limit,
    count: changes.length,
    dateRange,
    changes,
  };
}
