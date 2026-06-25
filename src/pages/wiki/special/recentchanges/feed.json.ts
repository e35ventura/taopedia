import type { APIRoute } from 'astro';
import { buildRecentChangesJsonFeedItems } from '../../../../lib/recent-changes-feed.js';
import { prepareRecentChangesFeedData } from '../../../../lib/recent-changes-feed-context';
import { RECENT_LIMIT } from '../../../../lib/recent-changes.js';
import { buildJsonFeed } from '../../../../../scripts/json-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const { changes, categoriesBySlug } = prepareRecentChangesFeedData(RECENT_LIMIT);
  const items = buildRecentChangesJsonFeedItems({ changes, origin, categoriesBySlug });

  const body = buildJsonFeed({
    siteUrl: `${origin}/`,
    feedPath: '/wiki/special/recentchanges/feed.json',
    homePageUrl: `${origin}/wiki/special/recentchanges/`,
    title: 'Taopedia - Recent changes',
    description: 'Most recent revision events across published Taopedia articles.',
    items,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
};
