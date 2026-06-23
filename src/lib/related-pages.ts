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
}

export interface ArticleRelatedPagesDocument {
  slug: string;
  title: string;
  url: string;
  relatedUrl: string;
  count: number;
  related: Array<{
    slug: string;
    title: string;
    summary: string | null;
    tags: string[];
    url: string;
    historyUrl: string;
    historyJsonUrl: string;
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
  relatedPages = [],
}: {
  slug: string;
  title: string;
  origin: string;
  relatedPages?: RelatedPage[];
}): ArticleRelatedPagesDocument {
  return {
    slug,
    title,
    url: `${origin}/wiki/${slug}/`,
    relatedUrl: `${origin}/wiki/${slug}/related.json`,
    count: relatedPages.length,
    related: relatedPages.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      summary: entry.summary || null,
      tags: entry.tags,
      url: `${origin}/wiki/${entry.slug}/`,
      historyUrl: `${origin}/wiki/${entry.slug}/history/`,
      historyJsonUrl: `${origin}/wiki/${entry.slug}/history.json`,
    })),
  };
}
