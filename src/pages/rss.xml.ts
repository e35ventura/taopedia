import type { APIRoute } from 'astro';
import { lastmodForSlug } from '../lib/article-history';
import { buildRssFeed } from '../../scripts/rss-feed.js';
import slugMap from '../../public/data/slugmap.json';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/slugmap.json for title/summary/categories — the same
  // artifact feed.json (#1422), atom.xml (#1423), search-data.json (#1405), and
  // sitemap.xml (#1416) use — instead of calling getCollection('pages') and
  // re-reading every article's frontmatter.
  const items = Object.entries(slugMap).map(([slug, entry]) => ({
    title: entry?.title ?? slug,
    url: `${origin}/wiki/${slug}/`,
    image: `${origin}/og/${slug}.png`,
    description: entry?.summary ?? '',
    categories: entry?.categories ?? [],
    date: lastmodForSlug(slug),
  }));

  const body = buildRssFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
