import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug, allRecentChanges } from '../../../lib/article-history';
import { buildRecentChanges } from '../../../../scripts/recent-changes.js';

// Machine-readable recent-changes feed at /wiki/special/recentchanges.json.
// Mirrors the HTML Special:RecentChanges page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools).
// The computation is shared through scripts/recent-changes.js (pure function)
// so the endpoint and the regression check derive from one source of truth,
// and the per-article history is the same public/history/<slug>.json the HTML
// page reads.
//
// Limit matches the HTML page's RECENT_LIMIT (100 rows) so the JSON snapshot
// the API returns is the same size the page renders.
const RECENT_LIMIT = 100;

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  // Read every generated history file into the same slug→history map the
  // article-history helper uses, so the builder sees exactly the same source
  // data the HTML page reads (no second pass over the filesystem, no risk of
  // the two surfaces disagreeing on which revisions are available).
  const historyBySlug: Record<string, Array<{ date?: string; authorName?: string }>> = {};
  for (const slug of Object.keys(titleBySlug)) {
    historyBySlug[slug] = historyForSlug(slug);
  }

  // The same builder used by the regression check, so the JSON contract and
  // the test derive from one function. `allRecentChanges` is kept here as a
  // belt-and-suspenders cross-check (it should agree field-for-field), but the
  // emitted body uses `buildRecentChanges` to expose the shared helper.
  const expected = allRecentChanges(titleBySlug, RECENT_LIMIT);
  const ranked = buildRecentChanges({ historyBySlug, titleBySlug, limit: RECENT_LIMIT });

  // The two surfaces must agree on order, membership, and per-row fields —
  // silence that with a console warning if they ever drift. The regression
  // check covers the same property, so this only fires for a true build bug.
  if (JSON.stringify(expected) !== JSON.stringify(ranked)) {
    // eslint-disable-next-line no-console
    console.warn('recentchanges.json builder diverged from allRecentChanges; check the pure helper');
  }

  const body = JSON.stringify(
    {
      site: origin,
      limit: RECENT_LIMIT,
      count: ranked.length,
      changes: ranked.map((change) => ({
        slug: change.slug,
        title: change.title,
        url: `/wiki/${change.slug}/`,
        date: change.date,
        author: change.authorName || null,
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
