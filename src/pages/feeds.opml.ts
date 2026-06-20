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
      // The OPML index only changes on a full site rebuild, so it is safe to
      // cache at the CDN/edge for a short window and revalidate after. Without
      // an explicit Cache-Control, CDNs and browsers fall back to heuristics
      // and may either re-fetch on every request or cache stale content
      // indefinitely. A 5-minute max-age with must-revalidate matches the
      // site-rebuild cadence (and is the same shape the OG image route uses,
      // adapted to a shorter lifetime because this endpoint is small text
      // rather than immutable bytes).
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
};
