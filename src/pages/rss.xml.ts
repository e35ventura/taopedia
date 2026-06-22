import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, lastmodForSlug } from '../lib/article-history';
import { buildRssFeed } from '../../scripts/rss-feed.js';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://taopedia.org');
  const origin = base.origin;
  const pages = await getCollection('pages');

  // Each entry maps 1:1 to a canonical trailing-slash article route, the same URL
  // shape used by the sitemap and the article canonical link. buildRssFeed orders
  // items newest-first and derives the channel lastBuildDate.
  const items = pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      title: page.data.title,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: page.data.summary ?? '',
      categories: page.data.categories ?? [],
      date: lastmodForSlug(slug),
    };
  });

  const body = buildRssFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
