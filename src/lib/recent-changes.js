import { compareTitles } from './title-sort.js';

export const RECENT_CHANGES_LIMIT = 100;

// Flatten per-article revision histories into one newest-first site-wide list.
// Slugs without a published title and entries without a valid date are skipped.
export const collectRecentChanges = (historyBySlug, titleBySlug, limit = RECENT_CHANGES_LIMIT) => {
  const changes = [];
  for (const [slug, history] of Object.entries(historyBySlug || {})) {
    const title = titleBySlug?.[slug];
    if (!title) continue;
    for (const entry of history || []) {
      if (typeof entry?.date !== 'string' || !entry.date) continue;
      changes.push({ slug, title, date: entry.date, authorName: entry.authorName });
    }
  }

  // ISO 8601 dates sort lexicographically by time; newest first. The slug
  // tiebreak keeps the output deterministic regardless of traversal order, and
  // numeric slugs such as subnet_9 vs subnet_10 must use compareTitles.
  changes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareTitles(a.slug, b.slug);
  });

  return limit > 0 ? changes.slice(0, limit) : changes;
};
