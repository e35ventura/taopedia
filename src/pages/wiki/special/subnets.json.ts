import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildSubnetsIndex } from '../../../../scripts/subnets-index.js';

// Machine-readable subnet registry at /wiki/special/subnets.json. Mirrors the
// HTML Special:Subnets page as structured JSON for programmatic consumers
// (dashboards, monitoring, subnet explorers). The extraction and sort are
// shared through scripts/subnets-index.js (pure function) so the endpoint and
// the regression check derive from one source of truth.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const index = buildSubnetsIndex({
    pages,
    getPageSlug,
  });

  const body = JSON.stringify(
    {
      site: origin,
      ...index,
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
