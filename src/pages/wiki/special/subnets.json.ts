import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildSubnets } from '../../../../scripts/subnets.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

// Machine-readable subnet registry at /wiki/special/subnets.json. Mirrors the
// HTML Special:Subnets page as structured JSON for programmatic consumers
// (dashboards, monitoring, cross-referencing tools, LLM training corpora that
// want a clean by-number subnet list without the per-category concept articles
// mixed in). The computation is shared with the HTML page through
// scripts/subnets.js (pure function) so the endpoint and the regression check
// derive from one source of truth, and the netuid-numeric sort and "Subnet
// <n>: <name>" parsing are identical to the page renders.

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const subnets = buildSubnets({ pages, getPageSlug });

  const body = JSON.stringify(
    {
      site: origin,
      url: `${origin}/wiki/special/subnets.json`,
      // subnetsJsonUrl is the registry's canonical self-link named like every
      // sibling special-listing endpoint exposes it (categoriesJsonUrl,
      // allpagesJsonUrl, mostlinkedpagesJsonUrl, recentchangesJsonUrl,
      // statisticsJsonUrl). subnets.json was the lone outlier exposing the
      // self-link only under the generic `url` key — which is also overloaded,
      // since every subnet ROW uses `url` for the article URL. `url` is kept for
      // backwards compatibility; subnetsJsonUrl is the consistent name.
      subnetsJsonUrl: `${origin}/wiki/special/subnets.json`,
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
        backlinks: publishedInboundLinkCount(backlinksData, subnet.slug, titleBySlug),
        // The subnet article's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose per article and allpages.json / mostlinkedpages.json expose per
        // directory entry — so a subnet dashboard can show each subnet's age and
        // recency without a second fetch.
        revisionCount: historyForSlug(subnet.slug).length,
        firstEdited: historyForSlug(subnet.slug).at(-1)?.date ?? null,
        lastEdited: historyForSlug(subnet.slug)[0]?.date ?? null,
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
