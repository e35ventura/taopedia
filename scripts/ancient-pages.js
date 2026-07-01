import { compareTitles } from '../src/lib/title-sort.js';

export function buildAncientPages({ titleBySlug, revisionStatsBySlug }) {
  return Object.entries(titleBySlug ?? {})
    .map(([slug, title]) => {
      const stats = revisionStatsBySlug?.[slug] ?? {};
      return {
        slug,
        title,
        revisionCount: Number.isFinite(stats.revisionCount) ? stats.revisionCount : 0,
        firstEdited: stats.firstEdited ?? null,
        lastEdited: stats.lastEdited ?? null,
      };
    })
    .filter((entry) => entry.firstEdited)
    .sort(
      (a, b) =>
        String(a.firstEdited).localeCompare(String(b.firstEdited)) ||
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
