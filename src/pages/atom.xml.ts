import type { APIRoute } from 'astro';
import { historyForSlug } from '../lib/article-history';
import { buildAtomFeed } from '../../scripts/atom-feed.js';
import slugMap from '../../public/data/slugmap.json';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/slugmap.json for title/summary/categories — the same
  // artifact feed.json (#1422), search-data.json (#1405), and sitemap.xml (#1416)
  // use — instead of calling getCollection('pages') and re-reading frontmatter.
  // historyBySlug caches each article's revision history once for datePublished
  // and dateModified (historyForSlug is a full revision-history lookup per slug).
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const items = Object.entries(slugMap).map(([slug, entry]) => {
    const history = (historyBySlug[slug] ??= historyForSlug(slug));
    return {
      title: entry?.title ?? slug,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: entry?.summary ?? '',
      categories: entry?.categories ?? [],
      datePublished: history[history.length - 1]?.date ?? '',
      dateModified: history[0]?.date ?? '',
    };
  });

  const body = buildAtomFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};
