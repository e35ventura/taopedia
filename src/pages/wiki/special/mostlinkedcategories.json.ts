import type { APIRoute } from 'astro';
import { buildMostLinkedCategories } from '../../../../scripts/most-linked-categories.js';
import categoriesIndex from '../../../../public/data/categories.json';

// Machine-readable Special:MostLinkedCategories report at
// /wiki/special/mostlinkedcategories.json: the wiki's topics ranked by how many
// published articles are tagged with each one (the MediaWiki "Most used
// categories" maintenance report). It complements the alphabetical
// Special:Categories index by surfacing the largest, best-covered topics first,
// the category-side counterpart to Special:MostLinkedPages. The ranking is
// shared through scripts/most-linked-categories.js (pure function) so the
// endpoint and the regression check derive from one source of truth, over the
// same public/data/categories.json the categories.json endpoint reads. Each entry
// exposes the SAME per-topic fields Special:Categories' JSON does (hub URL,
// article-list + feed companions), so a consumer can switch between the two
// orderings without changing how it reads a row.

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const topics = buildMostLinkedCategories({ categoriesIndex });

  const body = JSON.stringify(
    {
      site: origin,
      mostlinkedcategoriesJsonUrl: `${origin}/wiki/special/mostlinkedcategories.json`,
      count: topics.length,
      categories: topics.map((topic) => ({
        name: topic.name,
        slug: topic.slug,
        // Distinct number of published articles tagged with this topic — the
        // figure the report ranks by, the same count Special:Categories exposes.
        articles: topic.count,
        url: `${origin}/wiki/category/${topic.slug}/`,
        articlesUrl: `${origin}/wiki/category/${topic.slug}/articles.json`,
        // articlesJsonUrl is the same article-list link under the consistent
        // <name>JsonUrl key every JSON companion uses; articlesUrl is kept for
        // parity with the categories.json envelope.
        articlesJsonUrl: `${origin}/wiki/category/${topic.slug}/articles.json`,
        feedUrl: `${origin}/wiki/category/${topic.slug}/feed.json`,
        // feedJsonUrl is the same JSON Feed link under the consistent
        // <name>JsonUrl key; feedUrl is kept for parity with categories.json.
        feedJsonUrl: `${origin}/wiki/category/${topic.slug}/feed.json`,
        atomUrl: `${origin}/wiki/category/${topic.slug}/atom.xml`,
        rssUrl: `${origin}/wiki/category/${topic.slug}/rss.xml`,
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
