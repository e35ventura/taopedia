import type { APIRoute } from 'astro';
import { lastmodForSlug } from '../lib/article-history';
import { buildRssFeed } from '../../scripts/rss-feed.js';
import slugMap from '../../public/data/slugmap.json';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/slugmap.json for title/summary/categories — the same
  // artifact feed.json (#1422), atom.xml (#1423), search-data.json (#1405), and
  // sitemap.xml (#1416) use — instead of calling getCollection('pages') and re-
  // reading frontmatter. lastmodBySlug caches each article's lastmod once
  // (lastmodForSlug is a full revision-history lookup per slug).
  const lastmodBySlug: Record<string, string> = {};
  const items = Object.entries(slugMap).map(([slug, entry]) => {
    lastmodBySlug[slug] ??= lastmodForSlug(slug);
    return {
      title: entry?.title ?? slug,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: entry?.summary ?? '',
      categories: entry?.categories ?? [],
      date: lastmodBySlug[slug] ?? '',
    };
  });

  const body = buildRssFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
