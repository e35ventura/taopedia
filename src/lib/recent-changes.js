// Pure: flatten per-slug revision histories into one newest-first list of
// changes, keeping only slugs that resolve to a published article title (so an
// orphaned history file — history exists but the article is no longer
// published — is skipped) and entries that carry a date. Shared by the
// article-history helper (src/lib/article-history.ts) and the
// recent-changes JSON endpoint (src/pages/wiki/special/recentchanges.json.ts
// + scripts/recent-changes.js) so the HTML page, the JSON endpoint, and the
// regression check derive from one source instead of duplicating the logic.
//
// Extracted into a `.js` file so it can be imported from both the Astro
// endpoint and the build-time `scripts/` regression check without going
// through TypeScript or `import.meta.glob`. The article-history helper keeps
// the build-time glob side-effect (`historyForSlug`, `allRecentChanges`) and
// re-exports `collectRecentChanges` from this file unchanged so existing
// callers see the same surface.

import { compareTitles } from './title-sort.js';

export function collectRecentChanges(historyBySlug, titleBySlug, limit) {
  const changes = [];
  for (const [slug, history] of Object.entries(historyBySlug || {})) {
    const title = titleBySlug[slug];
    if (!title) continue;
    for (const entry of history || []) {
      if (typeof entry?.date !== 'string' || !entry.date) continue;
      changes.push({ slug, title, date: entry.date, authorName: entry.authorName });
    }
  }
  // ISO 8601 dates sort lexicographically by time; newest first.
  // Slug tiebreak for same-timestamp entries keeps the output deterministic
  // regardless of the import.meta.glob traversal order. Numeric slugs such as
  // subnet_9 vs subnet_10 must use compareTitles rather than raw string order.
  changes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareTitles(a.slug, b.slug);
  });
  return limit > 0 ? changes.slice(0, limit) : changes;
}
