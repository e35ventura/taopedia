import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildAllPages } from '../../../../scripts/allpages.js';

// Machine-readable article directory at /wiki/special/allpages.json. Mirrors
// the HTML Special:AllPages page as structured JSON for programmatic
// consumers (dashboards, monitoring, cross-referencing tools). The
// computation is shared through scripts/allpages.js (pure function) so the
// endpoint and the regression check derive from one source of truth, and the
// grouping + ordering match the HTML page exactly so the two surfaces never
// disagree.
//
// Cap is generous: the HTML page renders every article, so the JSON should
// too (programmatic consumers typically want the full directory, not a
// page-sized slice). `totalArticles` reports the true article count even if
// the rows would have been truncated; `truncated` reports whether the cap
// actually fired.
const ALL_LIMIT = 5000;

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const getPageSlug = (page: { id: string }) =>
    page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

  const { groups, count, totalArticles, truncated } = buildAllPages({
    pages,
    getPageSlug,
    limit: ALL_LIMIT,
  });

  const body = JSON.stringify(
    {
      site: origin,
      limit: ALL_LIMIT,
      count,
      totalArticles,
      truncated,
      groups: groups.map((group) => ({
        topic: group.topic,
        categoryHref: group.categoryHref,
        pages: group.pages.map((row) => ({
          slug: row.slug,
          title: row.title,
          summary: row.summary || null,
          topics: row.topics,
          url: `/wiki/${row.slug}/`,
        })),
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
