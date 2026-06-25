import slugMap from '../../public/data/slugmap.json';
import { sortPagesByTitle } from './title-sort.js';

type SlugMapEntry = { title?: string; summary?: string; categories?: string[] };

// Published article metadata keyed by slug — covers every entry in
// public/data/slugmap.json. Shared by site feeds, JSON companions, HTML
// special pages, and the landing page so no surface re-scans getCollection
// frontmatter just to build title/summary/category maps.
export function publishedTitleBySlug(map: Record<string, SlugMapEntry> = slugMap) {
  return Object.fromEntries(
    Object.entries(map).map(([slug, entry]) => [slug, entry?.title ?? slug]),
  );
}

export function publishedSummaryBySlug(map: Record<string, SlugMapEntry> = slugMap) {
  return Object.fromEntries(
    Object.entries(map).map(([slug, entry]) => [slug, entry?.summary ?? '']),
  );
}

export function publishedCategoriesBySlug(map: Record<string, SlugMapEntry> = slugMap) {
  return Object.fromEntries(
    Object.entries(map).map(([slug, entry]) => [
      slug,
      Array.isArray(entry?.categories) ? entry.categories : [],
    ]),
  );
}

// Page-shaped entries for helpers (sortPagesByTitle, buildAllPages, buildSubnets)
// that only need title/summary/categories — not the full content collection body.
export function pagesFromSlugMap(map: Record<string, SlugMapEntry> = slugMap) {
  return Object.entries(map).map(([slug, entry]) => ({
    id: `${slug}/index.mdx`,
    data: {
      title: entry?.title ?? slug,
      summary: entry?.summary ?? '',
      categories: Array.isArray(entry?.categories) ? entry.categories : [],
    },
  }));
}

export function sortedPagesFromSlugMap(map: Record<string, SlugMapEntry> = slugMap) {
  return sortPagesByTitle(pagesFromSlugMap(map));
}

export function pageFromSlug(slug: string, map: Record<string, SlugMapEntry> = slugMap) {
  const entry = map[slug];
  if (!entry?.title) return null;
  return {
    id: `${slug}/index.mdx`,
    data: {
      title: entry.title,
      summary: entry.summary ?? '',
      categories: Array.isArray(entry.categories) ? entry.categories : [],
    },
  };
}
