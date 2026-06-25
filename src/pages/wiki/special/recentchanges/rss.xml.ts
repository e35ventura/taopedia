import type { APIRoute } from 'astro';
import { buildRecentChangesRssItems } from '../../../../lib/recent-changes-feed.js';
import { prepareRecentChangesFeedData } from '../../../../lib/recent-changes-feed-context';
import { RECENT_LIMIT } from '../../../../lib/recent-changes.js';
import { buildRssFeed } from '../../../../../scripts/rss-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const { changes, categoriesBySlug } = prepareRecentChangesFeedData(RECENT_LIMIT);
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
