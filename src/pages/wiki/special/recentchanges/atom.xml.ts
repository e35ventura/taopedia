import type { APIRoute } from 'astro';
import { buildRecentChangesAtomItems } from '../../../../lib/recent-changes-feed.js';
import { prepareRecentChangesFeedData } from '../../../../lib/recent-changes-feed-context';
import { RECENT_LIMIT } from '../../../../lib/recent-changes.js';
import { buildAtomFeed } from '../../../../../scripts/atom-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const { changes, categoriesBySlug } = prepareRecentChangesFeedData(RECENT_LIMIT);
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
