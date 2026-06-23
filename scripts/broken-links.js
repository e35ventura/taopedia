// Build the missing-internal-link report served at /wiki/special/brokenlinks.json
// and rendered by Special:Broken links. Kept as a pure function in scripts/ (like
// most-linked.js, statistics.js) so the Astro endpoints and the regression check
// share one source of truth without rendering the site.
//
// A "broken link" is an outbound wiki link from a published article whose
// resolved target slug is absent from the slug map — the same condition that
// makes article pages render the target as a red (.internal.new) link.

import { compareTitles } from '../src/lib/title-sort.js';

function isExcludedTarget(target) {
  if (!target) return true;
  const lower = String(target).toLowerCase();
  if (lower.startsWith('special/') || lower.startsWith('category/')) return true;
  if (lower.startsWith('special:') || lower.startsWith('category:')) return true;
  return false;
}

export function buildBrokenLinks({ linkGraph, slugMap }) {
  const publishedSlugs = new Set(Object.keys(slugMap ?? {}));
  const byTarget = new Map();

  for (const [fromSlug, links] of Object.entries(linkGraph ?? {})) {
    if (!publishedSlugs.has(fromSlug)) continue;

    for (const link of Array.isArray(links) ? links : []) {
      const target = link?.target;
      if (!target || isExcludedTarget(target)) continue;
      if (publishedSlugs.has(target)) continue;

      let entry = byTarget.get(target);
      if (!entry) {
        entry = {
          slug: target,
          texts: new Set(),
          from: new Map(),
        };
        byTarget.set(target, entry);
      }

      if (link.text) entry.texts.add(link.text);
      if (!entry.from.has(fromSlug)) {
        entry.from.set(fromSlug, {
          slug: fromSlug,
          title: slugMap[fromSlug]?.title || fromSlug,
        });
      }
    }
  }

  return [...byTarget.values()]
    .map((entry) => ({
      slug: entry.slug,
      count: entry.from.size,
      texts: [...entry.texts].sort((a, b) => compareTitles(a, b)),
      from: [...entry.from.values()].sort(
        (a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug),
      ),
    }))
    .sort((a, b) => b.count - a.count || compareTitles(a.slug, b.slug));
}
