import type { APIRoute } from 'astro';
import { buildSiteJsonAtomFeedItems } from '../lib/site-feed-context';
import { buildJsonFeed } from '../../scripts/json-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const items = buildSiteJsonAtomFeedItems(origin);
  const body = buildJsonFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
};
