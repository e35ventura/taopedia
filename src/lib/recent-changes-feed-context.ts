import { allRecentChanges } from './article-history';
import slugMap from '../../public/data/slugmap.json';

// Published article titles keyed by slug — covers every slug in slugmap.json.
// allRecentChanges() uses this map to filter history events to published articles.
export function publishedTitleBySlug() {
  return Object.fromEntries(
    Object.entries(slugMap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
  );
}

// Shared feed context for the recent-changes JSON/Atom/RSS endpoints. Reads
// public/data/slugmap.json for published slug titles and per-feed-member
// categories — the same artifact search-data.json (#1405) and the site-wide
// feeds (#1422–#1423) use — instead of calling getCollection('pages') and
// scanning every article's frontmatter. titleBySlug must still cover every
// published slug because allRecentChanges uses it to filter history events.
export function prepareRecentChangesFeedData(limit: number) {
  const titleBySlug = publishedTitleBySlug();
  const changes = allRecentChanges(titleBySlug, limit);

  // categories are only ever read by change.slug (≤ limit entries). Gate to feed
  // members — same compute-only-for-feed-members pattern as recentchanges.json
  // (#1232). Cached per slug since an article can appear in multiple changes.
  const categoriesBySlug: Record<string, string[]> = {};
  for (const change of changes) {
    if (change.slug in categoriesBySlug) continue;
    categoriesBySlug[change.slug] = slugMap[change.slug]?.categories ?? [];
  }

  return { changes, categoriesBySlug };
}
