import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildMostLinkedPages, buildMostLinkedPagesDocument } from '../../../../scripts/most-linked.js';
import {
  articleListingMetricsForSlug,
  formatArticleListingEntry,
} from '../../../../scripts/article-listing.js';
import { getListingArticleSlugMetadata } from '../../../../scripts/listing-metadata-cache.js';

// Machine-readable inbound-link ranking at /wiki/special/mostlinkedpages.json.
// Mirrors the HTML Special:MostLinkedPages page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools). The
// ranking is shared through scripts/most-linked.js (pure function) so the
// endpoint and the regression check derive from one source of truth, and the
// backlink graph is the same public/data/backlinks.json the HTML page reads.
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
  const ranked = buildMostLinkedPages({ backlinks: backlinksData, titleBySlug: metadata.titleBySlug });

  const body = JSON.stringify(
    buildMostLinkedPagesDocument({
      origin,
      pages: ranked.map((entry) =>
        formatArticleListingEntry({
          origin,
          slug: entry.slug,
          title: entry.title,
          summary: metadata.summaryBySlug[entry.slug] ?? '',
          categories: metadata.categoriesBySlug[entry.slug] ?? [],
          metrics: articleListingMetricsForSlug({
            slug: entry.slug,
            metadata,
            backlinksData,
            linkgraphData,
            inboundLinks: entry.count,
          }),
        }),
      ),
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
