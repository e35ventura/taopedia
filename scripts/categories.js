// Build the machine-readable category index served at
// /wiki/special/categories.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, opml.js) so the Astro endpoint and the
// regression check share one source of truth without rendering the site.
//
// The HTML Special:Categories page (src/pages/wiki/special/categories.astro)
// lists the same topics for human display; this builder exposes them as
// structured JSON for programmatic consumers (dashboards, navigation, cross-
// referencing tools): each topic's name, the count of articles tagged with it,
// and the canonical hub URL. Topics are ordered by compareTitles — the SAME
// numeric-collation sort the HTML page uses — so numeric-suffixed topics like
// "Subnet 9" and "Subnet 10" order numerically and the two surfaces agree.

import { compareTitles } from '../src/lib/title-sort.js';

export function buildCategories({ pages }) {
  const counts = new Map();
  for (const page of pages ?? []) {
    for (const category of page?.data?.categories ?? []) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => compareTitles(a.name, b.name));
}
