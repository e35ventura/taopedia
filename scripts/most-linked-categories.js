// Build the topic-usage ranking served at /wiki/special/mostlinkedcategories.json
// — the MediaWiki Special:MostLinkedCategories ("Most used categories") report:
// the wiki's categories ranked by how many published articles are tagged with
// each one. It is the category-side counterpart to Special:MostLinkedPages
// (articles ranked by inbound links); the existing Special:Categories page lists
// the same topics but in alphabetical order, so the largest, best-covered topics
// are not surfaced anywhere. Kept as a pure function in scripts/ (like
// most-linked.js / categories.js / wanted-pages.js) so the Astro endpoint and the
// regression check share one source of truth without rendering the site, over the
// same public/data/categories.json the HTML Special:Categories page already reads.

import { compareTitles } from '../src/lib/title-sort.js';
import { categorySlug } from './categories.js';

// Rank categories by DISTINCT tagged-article count (desc). Ties break on
// compareTitles(name) — the same numeric collation the Special:Categories page
// uses, so "Subnet 9" precedes "Subnet 10" — then on a plain code-unit slug
// comparison so the ranking is fully deterministic regardless of the
// categories.json key iteration order. Article counts are DISTINCT slug counts:
// an article that lists the same category twice in its frontmatter is one tagged
// article, matching buildCategories / getCategoryArticles, so a duplicate can
// never inflate a topic's rank. Empty topics (zero tagged articles) are dropped,
// exactly as buildCategories drops them, so the report never lists a topic with
// no members.
export function buildMostLinkedCategories({ categoriesIndex } = {}) {
  return Object.entries(categoriesIndex ?? {})
    .map(([name, slugs]) => ({
      name,
      slug: categorySlug(name),
      count: Array.isArray(slugs) ? new Set(slugs).size : 0,
    }))
    .filter(({ count }) => count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        compareTitles(a.name, b.name) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
