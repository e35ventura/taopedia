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

  const titleBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    categoriesBySlug[slug] = page.data.categories ?? [];
  }

  const changes = allRecentChanges(titleBySlug, RECENT_LIMIT);
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
