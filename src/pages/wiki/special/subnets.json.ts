import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildSubnets } from '../../../../scripts/subnets.js';

// Machine-readable subnet registry at /wiki/special/subnets.json. Mirrors the
// HTML Special:Subnets page as structured JSON for programmatic consumers
// (Bittensor dashboards, tooling, cross-referencing). The registry is shared
// through scripts/subnets.js (pure function) so the endpoint and the regression
// check derive from one source of truth, netuid-ordered like the HTML page.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const subnets = buildSubnets({ pages, getPageSlug });

  const body = JSON.stringify(
    {
      site: origin,
      count: subnets.length,
      subnets: subnets.map((subnet) => ({
        netuid: subnet.netuid,
        name: subnet.name,
        slug: subnet.slug,
        url: `/wiki/${subnet.slug}/`,
        summary: subnet.summary,
      })),
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
