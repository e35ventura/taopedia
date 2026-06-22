import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildSubnets } from '../../../../scripts/subnets.js';

// Machine-readable subnet registry at /wiki/special/subnets.json. Mirrors the
// HTML Special:Subnets page as structured JSON for programmatic consumers
// (dashboards, monitoring, cross-referencing tools, LLM training corpora that
// want a clean by-number subnet list without the per-category concept articles
// mixed in). The computation is shared with the HTML page through
// scripts/subnets.js (pure function) so the endpoint and the regression check
// derive from one source of truth, and the netuid-numeric sort and "Subnet
// <n>: <name>" parsing are identical to the page renders.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const subnets = buildSubnets({ pages, getPageSlug });

  const body = JSON.stringify(
    {
      site: origin,
      url: `${origin}/wiki/special/subnets.json`,
      count: subnets.length,
      subnets: subnets.map((subnet) => ({
        netuid: subnet.netuid,
        name: subnet.name,
        slug: subnet.slug,
        summary: subnet.summary || null,
        url: `${origin}/wiki/${subnet.slug}/`,
        historyUrl: `${origin}/wiki/${subnet.slug}/history/`,
        backlinksUrl: `${origin}/wiki/${subnet.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${subnet.slug}/backlinks.json`,
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
