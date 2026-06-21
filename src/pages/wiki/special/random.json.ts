import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildRandomPick } from '../../../../scripts/random.js';

// Machine-readable random-article pick at /wiki/special/random.json. Mirrors
// the HTML Special:Random page for programmatic consumers (link rotators,
// "next article" embeds, monitoring smoke tests) that want a canonical
// article URL without rendering the page. The computation lives in
// scripts/random.js (pure function) so the endpoint and the regression
// check share one source of truth, and the slug/url derivation matches
// getPageSlug so the response is interchangeable with /search-data.json
// entries (same field shape: title, summary, url, categories).
//
// Each request picks from a uniformly random index; the chosen seed and
// the (sorted) total are echoed back so a caller can replay the pick by
// passing the seed back through the regression check / builder.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const pick = buildRandomPick({ pages });

  if (!pick) {
    return new Response(JSON.stringify({ site: origin, error: 'no articles available' }, null, 2), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const body = JSON.stringify(
    {
      site: origin,
      count: 1,
      seed: pick.seed,
      total: pick.total,
      article: {
        slug: pick.slug,
        title: pick.title,
        summary: pick.summary || null,
        url: pick.url,
        categories: pick.categories,
      },
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
