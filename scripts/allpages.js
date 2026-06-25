// Build the machine-readable article directory served at
// /wiki/special/allpages.json. Kept as a thin wrapper around the existing
// `sortPagesByTitle` helper (src/lib/title-sort.js), the same helper the HTML
// Special:AllPages page (src/pages/wiki/special/allpages.astro) imports, so
// the JSON and HTML surfaces never disagree on article order — both call the
// same function with the same content collection and the same code-unit
// tiebreak the rest of the build uses.
//
// Pure: no I/O side effects, no environment reads, no clock — the same input
// always produces the same output, so the regression check can pin a specific
// expected directory.

import { sortPagesByTitle } from '../src/lib/title-sort.js';

export function buildAllPages({ pages, getPageSlug, origin }) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const base = String(origin ?? '').replace(/\/+$/, '');
  // Reuse the exact same sort the HTML page uses. The helper breaks title
  // ties with a plain code-unit id comparison (NOT localeCompare) so the
  // order does not depend on the build machine's locale — same contract the
  // HTML page and the regression check rely on.
  const sorted = sortPagesByTitle(pages);
  return sorted.map((page) => ({
    slug: getPageSlug(page),
    title: page?.data?.title ?? '',
    summary: page?.data?.summary ?? '',
    url: `${base}/wiki/${getPageSlug(page)}/`,
    // Dedupe repeated frontmatter topics so a duplicated tag cannot appear twice
    // in the machine-readable directory (matching the HTML topic-group fix).
    categories: Array.isArray(page?.data?.categories) ? [...new Set(page.data.categories)] : [],
  }));
}
