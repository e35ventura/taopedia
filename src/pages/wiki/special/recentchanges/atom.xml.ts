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

  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const changes = allRecentChanges(titleBySlug, RECENT_LIMIT);
  const items = buildRecentChangesAtomItems({ changes, origin });

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
