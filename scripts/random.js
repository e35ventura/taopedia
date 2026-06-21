// Build the machine-readable random-article pick served at
// /wiki/special/random.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, categories.js, subnets.js) so the Astro
// endpoint and the regression check share one source of truth without
// rendering the site.
//
// The HTML Special:Random page (src/pages/wiki/special/random.astro) picks a
// random article at runtime from /search-data.json; this builder exposes the
// same selection as structured JSON for programmatic consumers (link
// rotators, "next article" embeds, monitoring smoke tests that just want one
// canonical article URL). Determinism for the regression check: every entry
// carries the same `slug` and `url` the search-data index would resolve, the
// builder accepts a seed so the regression check can pin the output, and a
// non-seeded call falls back to a uniform random pick (so live consumers see
// a fresh article on every request).
//
// Mirrors the search-data contract: the same `getPageSlug` derivation the
// content collection uses, the same field shape search-data.json exposes
// (title, summary, url, categories), so a downstream consumer that already
// parses search-data.json can parse random.json without an extra schema.

import { compareTitles } from '../src/lib/title-sort.js';

export function buildRandomPick({ pages, seed }) {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  // Sort by slug first so the (optional) seed picks from a deterministic
  // candidate list — without this, two requests that happen to share a seed
  // could pick from different slices of an unordered collection, and the
  // regression check could not pin a single expected output.
  const sorted = [...pages]
    .map((page) => {
      const slug = page?.id
        ? page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '')
        : '';
      return { page, slug };
    })
    .filter((entry) => entry.slug.length > 0)
    .sort((a, b) => compareTitles(a.slug, b.slug));
  if (sorted.length === 0) return null;

  // Mulberry32: a tiny, fast, seeded PRNG. Picking an index from a sorted list
  // with a 32-bit seed gives the regression check a stable expected output
  // (same seed -> same index -> same row), and a non-seeded call gets a fresh
  // uniform pick on every request.
  function mulberry32(state) {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const normalized = typeof seed === 'number' && Number.isFinite(seed)
    ? (seed >>> 0)
    : (Math.floor(Math.random() * 0xffffffff) >>> 0);
  const index = Math.floor(mulberry32(normalized) * sorted.length);
  const pick = sorted[index];

  return {
    slug: pick.slug,
    title: pick.page?.data?.title ?? '',
    summary: pick.page?.data?.summary ?? '',
    url: `/wiki/${pick.slug}/`,
    categories: Array.isArray(pick.page?.data?.categories) ? pick.page.data.categories : [],
    seed: normalized,
    index,
    total: sorted.length,
  };
}
