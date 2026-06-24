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
  revisionCount: number;
  firstEdited: string | null;
  lastEdited: string | null;
  url: string;
  relatedUrl: string;
  historyUrl: string;
  historyJsonUrl: string;
  backlinksUrl: string;
  backlinksJsonUrl: string;
  infoUrl: string;
  infoJsonUrl: string;
  tocJsonUrl: string;
  citeUrl: string;
  citeJsonUrl: string;
  bibtexUrl: string;
  referencesUrl: string;
  imageUrl: string;
  count: number;
  related: Array<{
    slug: string;
    title: string;
    summary: string | null;
    tags: string[];
    categories: string[];
    backlinks: number;
    referencesCount: number;
    wordCount: number;
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
    relatedUrl: string;
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
      compareTitles(a.slug, b.slug),
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
    categories,
    // The article's own published inbound-link count — the same figure
    // info.json / history.json / cite.json expose on their envelopes (via the
    // shared helper), so related.json can show link popularity without a refetch.
    incomingLinks,
    // The article's published OUTBOUND reference count — the complement of
    // incomingLinks, the same figure info.json / history.json / cite.json expose.
    referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
    // The article's table-of-contents section count — the same figure toc.json
    // exposes as `count` (via the shared getArticleToc helper).
    sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
    // The article body's word count — the same figure info.json / history.json
    // expose and the article-page footer (mw-article-meta data-word-count) renders.
    wordCount: Number.isFinite(wordCount) ? wordCount : 0,
    // The article's revision count (its commit-history length) — the same figure
    // info.json / history.json / cite.json expose on their envelopes.
    revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
    // The article's first/last revision dates (history is newest-first) — the
    // same firstEdited/lastEdited pair info.json and history.json expose.
    firstEdited: firstEdited ?? null,
    lastEdited: lastEdited ?? null,
    url: `${origin}/wiki/${slug}/`,
    relatedUrl: `${origin}/wiki/${slug}/related.json`,
    historyUrl: `${origin}/wiki/${slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
    backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
    infoUrl: `${origin}/wiki/${slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
    tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
    citeUrl: `${origin}/wiki/${slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${slug}/references.json`,
    imageUrl: `${origin}/og/${slug}.png`,
    count: relatedPages.length,
    related: relatedPages.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      summary: entry.summary || null,
      tags: entry.tags,
      categories: Array.isArray(entry.categories) ? entry.categories : [],
      backlinks: Number.isFinite(entry.backlinks) ? entry.backlinks : 0,
      referencesCount: Number.isFinite(entry.referencesCount) ? entry.referencesCount : 0,
      wordCount: Number.isFinite(entry.wordCount) ? entry.wordCount : 0,
      revisionCount: Number.isFinite(entry.revisionCount) ? entry.revisionCount : 0,
      firstEdited: entry.firstEdited ?? null,
      lastEdited: entry.lastEdited ?? null,
      url: `${origin}/wiki/${entry.slug}/`,
      infoUrl: `${origin}/wiki/${entry.slug}/info/`,
      infoJsonUrl: `${origin}/wiki/${entry.slug}/info.json`,
      backlinksUrl: `${origin}/wiki/${entry.slug}/backlinks/`,
      backlinksJsonUrl: `${origin}/wiki/${entry.slug}/backlinks.json`,
      historyUrl: `${origin}/wiki/${entry.slug}/history/`,
      historyJsonUrl: `${origin}/wiki/${entry.slug}/history.json`,
      citeUrl: `${origin}/wiki/${entry.slug}/cite/`,
      citeJsonUrl: `${origin}/wiki/${entry.slug}/cite.json`,
      bibtexUrl: `${origin}/wiki/${entry.slug}/cite.bib`,
      referencesUrl: `${origin}/wiki/${entry.slug}/references.json`,
      relatedUrl: `${origin}/wiki/${entry.slug}/related.json`,
      tocJsonUrl: `${origin}/wiki/${entry.slug}/toc.json`,
      imageUrl: `${origin}/og/${entry.slug}.png`,
    })),
  };
}
