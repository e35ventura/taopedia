import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildOpml } from '../../scripts/opml.js';

// OPML 2.0 subscription index at /feeds.opml. Lists every site-wide and
// per-category feed so a reader can bulk-subscribe in one import (Feedly,
// Inoreader, Reeder, NetNewsWire, …) instead of subscribing to each feed URL
// individually. The per-category xmlUrls mirror the routes already built by
// src/pages/wiki/category/[category]/{rss.xml,atom.xml,feed.json}.ts.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const categories = new Set<string>();
  for (const page of pages) {
    for (const category of page.data.categories ?? []) categories.add(category);
  }

  const body = buildOpml({
    origin,
    categories: [...categories],
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/x-opml; charset=utf-8',
    },
  });
};
