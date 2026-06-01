// src/lib/related.ts
// Scores "Related pages" for an article using the link graph that
// scripts/build-linkgraph.js emits (slugmap.json, backlinks.json, linkgraph.json).
//
// Signals, combined into a single score:
//   - shared categories      (topical overlap)
//   - a direct link either way (this page links to it, or it links to this page)
//   - co-citation            (pages cited alongside this one, or citing the same sources)

export interface SlugInfo {
  title: string;
  categories: string[];
  summary: string;
}
export type SlugMap = Record<string, SlugInfo>;

export interface Backlink {
  from: string;
  fromTitle: string;
}
export type Backlinks = Record<string, Backlink[]>;

export interface OutLink {
  target: string;
  text: string;
}
export type LinkGraph = Record<string, OutLink[]>;

export interface RelatedPage {
  slug: string;
  title: string;
  summary: string;
  score: number;
  sharedCategories: string[];
}

export interface RelatedData {
  slugMap: SlugMap;
  backlinks: Backlinks;
  linkGraph: LinkGraph;
}

const WEIGHTS = { category: 3, directLink: 4, coCitation: 1 };

export function getRelatedPages(
  slug: string,
  data: RelatedData,
  limit = 6
): RelatedPage[] {
  const { slugMap, backlinks, linkGraph } = data;
  const self = slugMap[slug];
  if (!self) return [];

  const selfCats = new Set(self.categories || []);
  const scores = new Map<string, number>();
  const add = (other: string, n: number) => {
    if (other === slug || !slugMap[other]) return;
    scores.set(other, (scores.get(other) || 0) + n);
  };

  // How many pages are in each category — a shared membership in a small,
  // specific category (e.g. "Tokenomics", 4 pages) is a much stronger signal
  // than one in a large catch-all (e.g. "Subnets", 22 pages). Weight each
  // shared category inversely to its size so big categories don't flood the
  // results with near-arbitrary, equally-scored peers.
  const categorySize = new Map<string, number>();
  for (const info of Object.values(slugMap)) {
    for (const c of info.categories || []) {
      categorySize.set(c, (categorySize.get(c) || 0) + 1);
    }
  }

  // 1. Shared categories, weighted by category specificity.
  for (const [other, info] of Object.entries(slugMap)) {
    if (other === slug) continue;
    let catScore = 0;
    for (const c of info.categories || []) {
      if (selfCats.has(c)) {
        catScore += WEIGHTS.category / Math.sqrt(categorySize.get(c) || 1);
      }
    }
    if (catScore > 0) add(other, catScore);
  }

  // Unique, valid neighbours in each direction.
  const outgoing = new Set(
    (linkGraph[slug] || []).map((l) => l.target).filter((t) => slugMap[t])
  );
  const incoming = new Set(
    (backlinks[slug] || []).map((b) => b.from).filter((f) => slugMap[f])
  );

  // 2. A direct link in either direction.
  outgoing.forEach((t) => add(t, WEIGHTS.directLink));
  incoming.forEach((f) => add(f, WEIGHTS.directLink));

  // 3. Co-citation: other pages that link to a page we link to, or that are
  //    linked from a page that links to us. Dedupe per shared page so that a
  //    repeated link (the raw graph lists each occurrence) counts once — a page
  //    that links to a shared target four times is still a single co-citation.
  outgoing.forEach((t) => {
    new Set((backlinks[t] || []).map((b) => b.from)).forEach((f) =>
      add(f, WEIGHTS.coCitation)
    );
  });
  incoming.forEach((f) => {
    new Set((linkGraph[f] || []).map((l) => l.target)).forEach((t) =>
      add(t, WEIGHTS.coCitation)
    );
  });

  return Array.from(scores.entries())
    .map(([s, score]) => ({
      slug: s,
      title: slugMap[s].title,
      summary: slugMap[s].summary,
      score,
      sharedCategories: (slugMap[s].categories || []).filter((c) => selfCats.has(c)),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
