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

// The inbound-link graph is the same public/data/backlinks.json the HTML
// "What links here" page and mostlinkedpages.json / allpages.json read, so the
// per-subnet inbound count below matches those surfaces exactly.
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const subnets = buildSubnets({ pages, getPageSlug });

  // Count only inbound links from OTHER published articles — the same
  // orphan-skipping, published-only inbound count mostlinkedpages.json /
  // allpages.json expose per entry and info.json exposes as incomingLinks — so a
  // subnet dashboard can rank subnets by how often the wiki references them.
  const publishedSlugs = new Set(pages.map((page) => getPageSlug(page)));
  const inboundCount = (slug: string) =>
    (backlinksData[slug] ?? []).filter((link) => publishedSlugs.has(link?.from)).length;

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
        infoUrl: `${origin}/wiki/${subnet.slug}/info/`,
        infoJsonUrl: `${origin}/wiki/${subnet.slug}/info.json`,
        historyUrl: `${origin}/wiki/${subnet.slug}/history/`,
        historyJsonUrl: `${origin}/wiki/${subnet.slug}/history.json`,
        backlinksUrl: `${origin}/wiki/${subnet.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${subnet.slug}/backlinks.json`,
        citeUrl: `${origin}/wiki/${subnet.slug}/cite/`,
        citeJsonUrl: `${origin}/wiki/${subnet.slug}/cite.json`,
        bibtexUrl: `${origin}/wiki/${subnet.slug}/cite.bib`,
        referencesUrl: `${origin}/wiki/${subnet.slug}/references.json`,
        relatedUrl: `${origin}/wiki/${subnet.slug}/related.json`,
        tocJsonUrl: `${origin}/wiki/${subnet.slug}/toc.json`,
        imageUrl: `${origin}/og/${subnet.slug}.png`,
        categories: subnet.categories,
        backlinks: inboundCount(subnet.slug),
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
