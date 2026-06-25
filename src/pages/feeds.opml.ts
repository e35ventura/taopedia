import type { APIRoute } from 'astro';
import { buildOpml } from '../../scripts/opml.js';
import categoriesIndex from '../../public/data/categories.json';

// OPML 2.0 subscription index at /feeds.opml. Lists every site-wide feed, the
// Special:RecentChanges feed family, and every per-category feed so a reader
// can bulk-subscribe in one import (Feedly, Inoreader, Reeder, NetNewsWire, …)
// instead of subscribing to each feed URL individually. The per-category
// xmlUrls mirror the routes already built by
// src/pages/wiki/category/[category]/{rss.xml,atom.xml,feed.json}.ts.

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = buildOpml({
    origin,
    // Read the category list from the pre-built categories.json artifact — the
    // same source scripts/check-opml.js cross-references — instead of scanning
    // the full page collection to rediscover category names. buildOpml still
    // applies compareTitles before emitting outlines, so output is byte-identical.
    categories: Object.keys(categoriesIndex),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/x-opml; charset=utf-8',
    },
  });
};
