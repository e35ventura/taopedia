import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { collectRecentChanges } from '../../../../scripts/recent-changes.js';

// Machine-readable recent-changes feed at /wiki/special/recentchanges.json.
// Mirrors the HTML Special:RecentChanges page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools).
// The computation is shared through scripts/recent-changes.js's
// `collectRecentChanges` (the pure builder the HTML page and the
// src/lib/article-history.ts helper also use) so the endpoint, the HTML
// page, and the regression check derive from one source of truth, and the
// newest-first / numeric-slug tiebreak ordering is identical to the page
// renders.
//
// The build pre-generates per-slug history files at public/history/<slug>.json
// (scripts/generate-history.js) and a slug map at public/data/slugmap.json
// (scripts/build-linkgraph.js); the endpoint derives the title and history
// maps from the live content collection (the same source recentchanges.astro
// uses), so any draft / unpublished article tracks the same way the HTML
// page does.

const RECENT_LIMIT = 100;

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  // Build the titleBySlug + historyBySlug maps from the live content
  // collection (the source of truth the HTML page uses) instead of the
  // on-disk slug map, so the endpoint tracks any unpublished / draft
  // article the same way the HTML page does. Mirrors the loop in
  // recentchanges.astro exactly.
  const titleBySlug = {};
  const historyBySlug = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    historyBySlug[slug] = historyForSlug(slug);
  }

  const changes = collectRecentChanges(historyBySlug, titleBySlug, RECENT_LIMIT);

  const body = JSON.stringify(
    {
      site: origin,
      limit: RECENT_LIMIT,
      count: changes.length,
      changes: changes.map((change) => ({
        slug: change.slug,
        title: change.title,
        date: change.date,
        author: change.authorName ?? null,
        url: `/wiki/${change.slug}/`,
        historyUrl: `/wiki/${change.slug}/history/`,
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
