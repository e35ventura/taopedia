import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug, revisionStatsFromHistory } from '../../../lib/article-history';
import { uniqueFeedCategories } from '../../../lib/feed-categories.js';
import { publishedTitleBySlug } from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildSubnetsFromSlugMap } from '../../../../scripts/subnets.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';
import slugMap from '../../../../public/data/slugmap.json';

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
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const titleBySlug = publishedTitleBySlug();
  const subnets = buildSubnetsFromSlugMap(slugMap);

  const subnetSlugs = new Set(subnets.map((subnet) => subnet.slug));
  const pageBySlug = await contentPagesBySlug(subnetSlugs);

  // sectionCount is the subnet article's table-of-contents section count — the
  // same figure toc.json exposes as `count` and info.json / history.json expose
  // on their envelopes, derived from the shared getArticleToc helper. Rendered
  // only for the registry's subnet articles so a subnet dashboard can gauge each
  // subnet's depth (how many sections it documents) without a second fetch.
  // Gather each subnet's section count and revision history in a single pass over
  // the registry list. These were two separate loops over `subnets`; the history
  // read is folded into the render pass so the list is traversed once. History is
  // read before the no-page guard so every subnet still gets a history entry (the
  // render/sectionCount step is what requires a resolved page), keeping output
  // byte-identical.
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  // wordCount is only ever read by subnet.slug below, for the registry's subnet
  // articles (a subset of the full page collection — e.g. 128 of ~350) — not
  // every published article. Previously tokenized for the full collection up
  // front; gated into this same subnets-only loop that already scopes
  // sectionCount, the same compute-only-for-used-members pattern #1213 / #1232 /
  // #1240 use elsewhere.
  const wordCountBySlug: Record<string, number> = {};
  for (const subnet of subnets) {
    historyBySlug[subnet.slug] = historyForSlug(subnet.slug);
    const page = pageBySlug[subnet.slug];
    if (!page) continue;
    const { headings } = await render(page);
    sectionCountBySlug[subnet.slug] = getArticleToc(headings).length;
    wordCountBySlug[subnet.slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  }

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
      subnets: subnets.map((subnet) => {
        const inboundLinks = publishedInboundLinkCount(backlinksData, subnet.slug, titleBySlug);
        return {
          netuid: subnet.netuid,
          name: subnet.name,
          slug: subnet.slug,
          summary: subnet.summary || null,
          ...articleJsonCompanionUrls(origin, subnet.slug),
          imageUrl: `${origin}/og/${subnet.slug}.png`,
          categories: uniqueFeedCategories(subnet.categories),
          backlinks: inboundLinks,
          // incomingLinks is the same published-only inbound-link count exposed
          // under `backlinks`, aliased to the key name info.json / references.json /
          // backlinks.json use ("incomingLinks"), so a consumer can read it under the
          // consistent cross-endpoint name. `backlinks` is kept for back-compat.
          incomingLinks: inboundLinks,
          // referencesCount is the subnet article's published OUTBOUND reference
          // count — the complement of backlinks (its inbound count) — using the same
          // getArticleReferences helper (published-only join) that references.json /
          // cite.json / info.json use, so a subnet dashboard can see both directions
          // of each subnet's link degree without a second fetch.
          referencesCount: getArticleReferences({ slug: subnet.slug, linkGraph: linkgraphData, titleBySlug }).length,
          sectionCount: sectionCountBySlug[subnet.slug] ?? 0,
          wordCount: wordCountBySlug[subnet.slug] ?? 0,
          // The subnet article's estimated reading time in minutes — the same
          // ~200 wpm ceil estimate info.json exposes and the article-page footer
          // ("N min read") renders from wordCount, so a subnet dashboard can show
          // each subnet's reading time without a second fetch.
          readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[subnet.slug] ?? 0) / 200)),
          // The subnet article's revision stats (history is newest-first) — the same
          // revisionCount / firstEdited / lastEdited trio info.json / history.json
          // expose per article and allpages.json / mostlinkedpages.json expose per
          // directory entry — so a subnet dashboard can show each subnet's age and
          // recency without a second fetch.
          ...revisionStatsFromHistory(historyBySlug[subnet.slug] ?? []),
        };
      }),
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
