// Shared article slug + revision-history helpers for the build-time consumers
// (sitemap.xml.ts, rss.xml.ts, the Special:Statistics overview page, and the
// Special:RecentChanges page). Kept in one place so they derive route slugs and
// history from a single source instead of duplicating the logic. The
// component-side StructuredData history derivation is intentionally separate (it
// also needs the original publish date).

import { collectRecentChanges } from './recent-changes.js';
export { collectRecentChanges } from './recent-changes.js';

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
