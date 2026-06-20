// Build the machine-readable recent-changes feed served at
// /wiki/special/recentchanges.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, opml.js, rss-feed.js) so the Astro endpoint
// and the regression check share one source of truth without rendering the
// site.
//
// The HTML Special:RecentChanges page (src/pages/wiki/special/recentchanges.astro)
// computes the same newest-first feed inline for human display; this builder
// exposes it as structured JSON for programmatic consumers (dashboards,
// monitoring, cross-referencing tools, RSS aggregators that prefer JSON).
//
// Input is the same per-article revision history the HTML page reads
// (src/lib/article-history.ts allRecentChanges): a slug→title map joined to the
// per-article history, then flattened, date-sorted newest-first, and capped at
// `limit` rows. Slug tiebreaks use the SAME compareTitles helper the HTML page
// uses (numeric: true), so the JSON and HTML surfaces never disagree on
// numeric-suffixed slugs like "subnet_9" vs "subnet_10".

import { compareTitles } from '../src/lib/title-sort.js';

export function buildRecentChanges({ historyBySlug, titleBySlug, limit }) {
  const changes = [];
  for (const [slug, history] of Object.entries(historyBySlug ?? {})) {
    const title = titleBySlug?.[slug];
    if (!title) continue;
    if (!Array.isArray(history)) continue;
    for (const entry of history) {
      const date = typeof entry?.date === 'string' ? entry.date : '';
      if (!date) continue;
      const authorName = typeof entry?.authorName === 'string' ? entry.authorName : '';
      changes.push({ slug, title, date, authorName });
    }
  }
  // ISO 8601 dates sort lexicographically by time; newest first. Slug
  // tiebreak keeps the output deterministic regardless of input order, and
  // numeric-suffixed slugs (subnet_9 vs subnet_10) must use the natural
  // numeric order (compareTitles with numeric: true) so the JSON matches
  // what the HTML page renders.
  changes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareTitles(a.slug, b.slug);
  });
  if (!Number.isFinite(limit) || limit <= 0) return changes;
  return changes.slice(0, limit);
}
