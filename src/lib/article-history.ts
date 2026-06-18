// Shared article slug + revision-history helpers for the build-time consumers
// (sitemap.xml.ts, rss.xml.ts, the Special:Statistics overview page, and the
// Special:RecentChanges page). Kept in one place so they derive route slugs and
// history from a single source instead of duplicating the logic. The
// component-side StructuredData history derivation is intentionally separate (it
// also needs the original publish date).

import { compareTitles } from './title-sort.js';

// Strip a content-collection id (`<slug>/index.mdx`, `<slug>/index`, `<slug>.md`)
// down to the route slug.
export const getPageSlug = (page: { id: string }): string =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

type HistoryEntry = { date?: string; authorName?: string };
const HISTORY_PREFIX = '../../public/history/';

// The build generates per-article revision history at public/history/<slug>.json
// (scripts/generate-history.js, ordered newest-first). Returns [] when none.
const historyModules = import.meta.glob('../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: Array<HistoryEntry> } }
>;

export const historyForSlug = (slug: string): Array<HistoryEntry> => {
  const mod = historyModules[`${HISTORY_PREFIX}${slug}.json`];
  return mod?.default?.history ?? [];
};

// The newest commit date is each article's last-modified time ('' when none).
export const lastmodForSlug = (slug: string): string => {
  const date = historyForSlug(slug)[0]?.date;
  return typeof date === 'string' ? date : '';
};

// A single site-wide change: one commit, joined to its article's title/route.
export interface RecentChange {
  slug: string;
  title: string;
  date: string;
  authorName?: string;
}

// Pure: flatten per-slug revision histories into one newest-first list of
// changes, keeping only slugs that resolve to a published article title (so an
// orphaned history file — history exists but the article is no longer
// published — is skipped) and entries that carry a date. Exported for testing.
export const collectRecentChanges = (
  historyBySlug: Record<string, Array<HistoryEntry>>,
  titleBySlug: Record<string, string>,
  limit: number,
): RecentChange[] => {
  const changes: RecentChange[] = [];
  for (const [slug, history] of Object.entries(historyBySlug)) {
    const title = titleBySlug[slug];
    if (!title) continue;
    for (const entry of history) {
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
};

// Read every generated history file and return the most recent changes
// site-wide, joined to the given slug→title map.
export const allRecentChanges = (titleBySlug: Record<string, string>, limit: number): RecentChange[] => {
  const historyBySlug: Record<string, Array<HistoryEntry>> = {};
  for (const [key, mod] of Object.entries(historyModules)) {
    if (!key.startsWith(HISTORY_PREFIX) || !key.endsWith('.json')) continue;
    const slug = key.slice(HISTORY_PREFIX.length, -'.json'.length);
    historyBySlug[slug] = mod?.default?.history ?? [];
  }
  return collectRecentChanges(historyBySlug, titleBySlug, limit);
};
