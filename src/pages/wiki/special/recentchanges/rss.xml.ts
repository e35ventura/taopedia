import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, allRecentChanges } from '../../../../lib/article-history';
import { buildRecentChangesRssItems } from '../../../../lib/recent-changes-feed.js';
import { RECENT_LIMIT } from '../../../../lib/recent-changes.js';
import { buildRssFeed } from '../../../../../scripts/rss-feed.js';

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
  // same compute-only-for-feed-members scoping as the sibling JSON (#1256) and
  // Atom (#1257) recent-changes feeds.
  const categoriesBySlug: Record<string, string[]> = {};
  for (const change of changes) {
    if (change.slug in categoriesBySlug) continue;
    categoriesBySlug[change.slug] = pageBySlug[change.slug]?.data.categories ?? [];
  }

  const items = buildRecentChangesRssItems({ changes, origin, categoriesBySlug });

  const body = buildRssFeed({
    siteUrl: `${origin}/`,
    feedPath: '/wiki/special/recentchanges/rss.xml',
    channelLink: `${origin}/wiki/special/recentchanges/`,
    title: 'Taopedia - Recent changes',
    description: 'Most recent revision events across published Taopedia articles.',
    items,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
