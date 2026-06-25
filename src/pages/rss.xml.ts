import type { APIRoute } from 'astro';
import { buildSiteRssFeedItems } from '../lib/site-feed-context';
import { buildRssFeed } from '../../scripts/rss-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Each entry maps 1:1 to a canonical trailing-slash article route, the same URL
  // shape used by the sitemap and the article canonical link. buildRssFeed orders
  // items newest-first and derives the channel lastBuildDate.
  const items = buildSiteRssFeedItems(origin);
  const body = buildRssFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
