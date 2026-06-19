import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildStatistics } from '../../../../scripts/statistics.js';

// Machine-readable site statistics at /wiki/special/statistics.json. Mirrors
// the figures shown on the HTML Special:Statistics page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools).
// The computation is shared through scripts/statistics.js (pure function) so
// the endpoint and the regression check derive from one source of truth.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const stats = buildStatistics({
    pages,
    historyForSlug,
    getPageSlug,
  });

  const body = JSON.stringify(
    {
      site: origin,
      ...stats,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
