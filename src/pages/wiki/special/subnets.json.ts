import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildSubnets, buildSubnetsDocument } from '../../../../scripts/subnets.js';
import {
  articleListingMetricsForSlug,
  formatArticleListingEntry,
} from '../../../../scripts/article-listing.js';
import { getListingArticleSlugMetadata } from '../../../../scripts/listing-metadata-cache.js';

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
  const pages = await getCollection('pages');
  const metadata = await getListingArticleSlugMetadata({
    pages,
    getPageSlug,
    historyForSlug,
    renderPage: render,
    getArticleToc,
  });
  const subnets = buildSubnets({ pages, getPageSlug });

  const body = JSON.stringify(
    buildSubnetsDocument({
      origin,
      subnets: subnets.map((subnet) => {
        const { title: _title, ...entry } = formatArticleListingEntry({
          origin,
          slug: subnet.slug,
          title: metadata.titleBySlug[subnet.slug] ?? subnet.name,
          summary: subnet.summary,
          categories: subnet.categories,
          metrics: articleListingMetricsForSlug({
            slug: subnet.slug,
            metadata,
            backlinksData,
            linkgraphData,
          }),
        });
        return {
          netuid: subnet.netuid,
          name: subnet.name,
          ...entry,
        };
      }),
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
