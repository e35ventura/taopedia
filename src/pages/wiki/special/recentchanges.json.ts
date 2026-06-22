import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { allRecentChanges, getPageSlug } from '../../../lib/article-history';
import { RECENT_CHANGES_LIMIT } from '../../../lib/recent-changes.js';

// Machine-readable recent changes feed at /wiki/special/recentchanges.json.
// Mirrors the HTML Special:RecentChanges page as structured JSON for
// programmatic consumers (dashboards, monitoring, mirrors) and reuses the same
// shared helper for membership, ordering, and the row limit so the HTML and
// JSON surfaces cannot silently drift.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const changes = allRecentChanges(titleBySlug, RECENT_CHANGES_LIMIT);

  const body = JSON.stringify(
    {
      site: origin,
      count: changes.length,
      limit: RECENT_CHANGES_LIMIT,
      changes: changes.map((change) => ({
        slug: change.slug,
        title: change.title,
        url: `${origin}/wiki/${change.slug}/`,
        historyUrl: `${origin}/wiki/${change.slug}/history/`,
        date: change.date,
        authorName: change.authorName ?? null,
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
