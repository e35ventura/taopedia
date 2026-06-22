import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../lib/article-history';
import { buildJsonFeed } from '../../scripts/json-feed.js';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://taopedia.org');
  const origin = base.origin;
  const pages = await getCollection('pages');

  // Mirror /rss.xml: same canonical article URLs and newest-first ordering, but
  // serialize as JSON Feed 1.1 for clients that prefer JSON over XML.
  const items = pages.map((page) => {
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    const dateModified = history[0]?.date ?? '';
    const datePublished = history[history.length - 1]?.date ?? '';
    return {
      title: page.data.title,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: page.data.summary ?? '',
      categories: page.data.categories ?? [],
      datePublished,
      dateModified,
    };
  });

  const body = buildJsonFeed({ siteUrl: `${origin}/`, items });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
};
