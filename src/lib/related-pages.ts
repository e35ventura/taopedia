// Pure helper for the article-page "Related pages" section.
//
// It reuses the link graph + category index already generated at build time by
// scripts/build-linkgraph.js (public/data/{slugmap,categories,backlinks,linkgraph}.json).
// "Related" = articles that share a topic with this one, or that link to it —
// minus any page this article ALREADY links from its body or infobox. Excluding
// already-linked pages is the point: the block surfaces *new* related reading and
// never repeats the author-written "Related articles" list or any inline link.
//
// No I/O here so the logic stays unit-testable; the .astro page passes the loaded
// JSON in. Capped small by default — a short, high-signal list reads better than a
// long one.

import { compareTitles } from './title-sort.js';
import { articleJsonCompanionUrls } from './wiki-article-path.js';

export interface SlugMapEntry {
  title?: string;
  categories?: string[];
  summary?: string;
}

export interface RelatedPagesInput {
  slug: string;
  slugMap: Record<string, SlugMapEntry>;
  categoriesIndex: Record<string, string[]>;
  backlinks: Record<string, Array<{ from: string }>>;
  outgoing: Record<string, Array<{ target: string }>>;
  publishedSlugs: Set<string>;
  titleBySlug: Record<string, string>;
  max?: number;
}

export interface RelatedPage {
  slug: string;
  title: string;
  summary: string;
  // Up to two short topic labels explaining the relation (shared topics first).
  tags: string[];
  // The candidate article's full topic categories (optional; the endpoint
  // enriches each entry from the slug map so consumers can group/filter).
  categories?: string[];
  // The candidate article's published inbound-link count (optional; the
  // endpoint enriches each entry so consumers can gauge link popularity).
  backlinks?: number;
  // The candidate article's published outbound-reference count (optional; the
  // endpoint enriches each entry with the same per-entry referencesCount
  // allpages.json / subnets.json expose).
  referencesCount?: number;
  // The candidate article's latest revision date (optional; the endpoint
  // enriches each entry so consumers can gauge recency).
  lastEdited?: string | null;
  // The candidate article's revision count + first-revision date (optional; the
  // endpoint enriches each entry with the same per-entry revision stats
  // references.json / allpages.json expose).
  revisionCount?: number;
  firstEdited?: string | null;
  // The candidate article's body word count (optional; the endpoint enriches
  // each entry with the same per-entry wordCount allpages.json / subnets.json expose).
  wordCount?: number;
  // The candidate article's table-of-contents section count (optional; the
  // endpoint enriches each entry with the same per-entry sectionCount
  // allpages.json / subnets.json expose).
  sectionCount?: number;
}

export interface ArticleRelatedPagesDocument {
  slug: string;
  title: string;
  summary: string | null;
  categories: string[];
  incomingLinks: number;
  referencesCount: number;
  sectionCount: number;
  wordCount: number;
  readingMinutes: number;
  revisionCount: number;
  firstEdited: string | null;
  lastEdited: string | null;
  url: string;
  relatedUrl: string;
  relatedJsonUrl: string;
  historyUrl: string;
  historyJsonUrl: string;
  backlinksUrl: string;
  backlinksJsonUrl: string;
  infoUrl: string;
  infoJsonUrl: string;
  tocUrl: string;
  tocJsonUrl: string;
  citeUrl: string;
  citeJsonUrl: string;
  bibtexUrl: string;
  referencesUrl: string;
  referencesJsonUrl: string;
  imageUrl: string;
  count: number;
  related: Array<{
    slug: string;
    title: string;
    summary: string | null;
    tags: string[];
    categories: string[];
    backlinks: number;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    readingMinutes: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    url: string;
    infoUrl: string;
    infoJsonUrl: string;
    backlinksUrl: string;
    backlinksJsonUrl: string;
    historyUrl: string;
    historyJsonUrl: string;
    citeUrl: string;
    citeJsonUrl: string;
    bibtexUrl: string;
    referencesUrl: string;
    referencesJsonUrl: string;
    relatedUrl: string;
    relatedJsonUrl: string;
    tocUrl: string;
    tocJsonUrl: string;
    imageUrl: string;
  }>;
}

export function getRelatedPages({
  slug,
  slugMap,
  categoriesIndex,
  backlinks,
  outgoing,
  publishedSlugs,
  titleBySlug,
  max = 4,
}: RelatedPagesInput): RelatedPage[] {
  const ownCategories = slugMap[slug]?.categories ?? [];
  const ownCategorySet = new Set(ownCategories);

  // Pages this article already links to (body + infobox) — excluded below.
  const alreadyLinked = new Set((outgoing[slug] ?? []).map((l) => l.target));
  // Pages that link TO this article.
  const backlinkSet = new Set((backlinks[slug] ?? []).map((b) => b.from));

  // Candidate pool: topic siblings ∪ inbound linkers.
  const candidates = new Set<string>();
  for (const cat of ownCategories) {
    for (const member of categoriesIndex[cat] ?? []) candidates.add(member);
  }
  for (const from of backlinkSet) candidates.add(from);

  const scored: Array<{ slug: string; title: string; summary: string; tags: string[]; score: number }> = [];
  for (const cand of candidates) {
    if (cand === slug) continue; // never relate to self
    if (alreadyLinked.has(cand)) continue; // already linked in the body
    if (!publishedSlugs.has(cand)) continue; // drop drafts / unpublished / stale

    const title = titleBySlug[cand] ?? slugMap[cand]?.title;
    if (!title) continue;

    const candCategories = slugMap[cand]?.categories ?? [];
    const shared = candCategories.filter((c) => ownCategorySet.has(c));
    const isBacklink = backlinkSet.has(cand);
    if (shared.length === 0 && !isBacklink) continue; // unreachable, but keep tidy

    // Transparent score: topic overlap dominates, an inbound link breaks ties up.
    const score = shared.length * 2 + (isBacklink ? 1 : 0);
    // Show shared topics first (the reason it's related), then fall back to the
    // candidate's own first topic for backlink-only relations.
    const tagSource = shared.length > 0 ? shared : candCategories;
    scored.push({
      slug: cand,
      title,
      summary: slugMap[cand]?.summary ?? '',
      tags: tagSource.slice(0, 2),
      score,
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      compareTitles(a.title, b.title) ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );

  return scored.slice(0, max).map(({ slug, title, summary, tags }) => ({ slug, title, summary, tags }));
}

export function buildArticleRelatedPages({
  slug,
  title,
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
  relatedPages = [],
}: {
  slug: string;
  title: string;
  origin: string;
  summary?: string;
  categories?: string[];
  incomingLinks?: number;
  referencesCount?: number;
  sectionCount?: number;
  wordCount?: number;
  revisionCount?: number;
  firstEdited?: string | null;
  lastEdited?: string | null;
  relatedPages?: RelatedPage[];
}): ArticleRelatedPagesDocument {
  return {
    slug,
    title,
    // The article's own one-line summary (null when blank), the same field the
    // sibling per-article envelopes (backlinks/toc/references/cite) expose, so a
    // consumer of related.json can show the article's description without a
    // second fetch.
    summary: summary || null,
    // The article's own topics, the same field the history.json and info.json
    // envelopes expose, so a consumer of related.json can see what the article
    // is tagged with (and why a related page shares its tags) without a second
    // fetch. The per-related-entry `tags` already expose each candidate's topics.
    categories: [...new Set(categories)],
    // The article's own published inbound-link count — the same figure
    // info.json / history.json / cite.json expose on their envelopes (via the
    // shared helper), so related.json can show link popularity without a refetch.
    // Finite-guarded like every other count field below (and the per-related-entry
    // incomingLinks) so a non-finite input can never serialize as JSON null.
    incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
    // The article's published OUTBOUND reference count — the complement of
    // incomingLinks, the same figure info.json / history.json / cite.json expose.
    referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
    // The article's table-of-contents section count — the same figure toc.json
    // exposes as `count` (via the shared getArticleToc helper).
    sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
    // The article body's word count — the same figure info.json / history.json
    // expose and the article-page footer (mw-article-meta data-word-count) renders.
    wordCount: Number.isFinite(wordCount) ? wordCount : 0,
    // Estimated reading time in minutes — the same ~200 wpm ceil formula the
    // article-page footer ("N min read") and info.json / toc.json / history.json
    // expose from wordCount.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
    // The article's revision count (its commit-history length) — the same figure
    // info.json / history.json / cite.json expose on their envelopes.
    revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
    // The article's first/last revision dates (history is newest-first) — the
    // same firstEdited/lastEdited pair info.json and history.json expose.
    firstEdited: firstEdited ?? null,
    lastEdited: lastEdited ?? null,
    ...articleJsonCompanionUrls(origin, slug),
    imageUrl: `${origin}/og/${slug}.png`,
    count: relatedPages.length,
    related: relatedPages.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      summary: entry.summary || null,
      tags: entry.tags,
      categories: Array.isArray(entry.categories) ? [...new Set(entry.categories)] : [],
      backlinks: Number.isFinite(entry.backlinks) ? entry.backlinks : 0,
      // info.json names this figure incomingLinks; keep backlinks for the field
      // name the HTML listing endpoints (allpages/subnets/category) expose.
      incomingLinks: Number.isFinite(entry.backlinks) ? entry.backlinks : 0,
      referencesCount: Number.isFinite(entry.referencesCount) ? entry.referencesCount : 0,
      sectionCount: Number.isFinite(entry.sectionCount) ? entry.sectionCount : 0,
      wordCount: Number.isFinite(entry.wordCount) ? entry.wordCount : 0,
      readingMinutes: Math.max(1, Math.ceil((Number.isFinite(entry.wordCount) ? entry.wordCount : 0) / 200)),
      revisionCount: Number.isFinite(entry.revisionCount) ? entry.revisionCount : 0,
      firstEdited: entry.firstEdited ?? null,
      lastEdited: entry.lastEdited ?? null,
      ...articleJsonCompanionUrls(origin, entry.slug),
      imageUrl: `${origin}/og/${entry.slug}.png`,
    })),
  };
}
