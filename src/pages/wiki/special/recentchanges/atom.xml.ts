import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, allRecentChanges } from '../../../../lib/article-history';
import { buildRecentChangesAtomItems } from '../../../../lib/recent-changes-feed.js';
import { RECENT_LIMIT } from '../../../../lib/recent-changes.js';
import { buildAtomFeed } from '../../../../../scripts/atom-feed.js';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://taopedia.org');
  const origin = base.origin;
  const pages = await getCollection('pages');

  // titleBySlug must cover every published article — allRecentChanges uses it to
  // resolve which slugs are published. pageBySlug lets the feed read each changed
  // article's categories without a second collection scan.
  const titleBySlug: Record<string, string> = {};
  const pageBySlug: Record<string, (typeof pages)[number]> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    pageBySlug[slug] = page;
  }

  const changes = allRecentChanges(titleBySlug, RECENT_LIMIT);

  // categories are only ever read by change.slug below (≤ RECENT_LIMIT entries),
  // but were previously copied from page.data for every one of the ~350 published
  // articles up front. Gate to the slugs that actually appear in the feed — the
  // same compute-only-for-feed-members pattern recentchanges.json (#1232) and
  // mostlinkedpages.json (#1240) use. Cached per slug since an article can appear
  // in multiple changes.
  const categoriesBySlug: Record<string, string[]> = {};
  for (const change of changes) {
    if (change.slug in categoriesBySlug) continue;
    const page = pageBySlug[change.slug];
    if (page) categoriesBySlug[change.slug] = page.data.categories ?? [];
  }
  const items = buildRecentChangesAtomItems({ changes, origin, categoriesBySlug });

  const body = buildAtomFeed({
    siteUrl: `${origin}/`,
    feedPath: '/wiki/special/recentchanges/atom.xml',
    homePageUrl: `${origin}/wiki/special/recentchanges/`,
    title: 'Taopedia - Recent changes',
    description: 'Most recent revision events across published Taopedia articles.',
    items,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};
