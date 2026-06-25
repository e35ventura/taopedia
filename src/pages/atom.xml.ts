import type { APIRoute } from 'astro';
import { buildSiteJsonAtomFeedItems } from '../lib/site-feed-context';
import { buildAtomFeed } from '../../scripts/atom-feed.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Mirror /rss.xml and /feed.json: same canonical article URLs and
  // newest-first ordering, but serialize as Atom 1.0 for clients that prefer the
  // Atom syndication format. Item metadata comes from public/data/slugmap.json
  // via site-feed-context (same artifact read as #1422 feed.json).
  const items = buildSiteJsonAtomFeedItems(origin);
  const body = buildAtomFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};
