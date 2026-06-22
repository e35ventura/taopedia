import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../lib/article-history';
import { buildAtomFeed } from '../../scripts/atom-feed.js';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://taopedia.org');
  const origin = base.origin;
  const pages = await getCollection('pages');

  // Mirror /rss.xml and /feed.json: same canonical article URLs and
  // newest-first ordering, but serialize as Atom 1.0 for clients that prefer the
  // Atom syndication format.
  const items = pages.map((page) => {
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    return {
      title: page.data.title,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: page.data.summary ?? '',
      categories: page.data.categories ?? [],
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
