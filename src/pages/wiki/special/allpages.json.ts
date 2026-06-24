import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildAllPages, buildAllPagesDocument } from '../../../../scripts/allpages.js';
import {
  articleListingMetricsForSlug,
  formatArticleListingEntry,
} from '../../../../scripts/article-listing.js';
import { getListingArticleSlugMetadata } from '../../../../scripts/listing-metadata-cache.js';

// Machine-readable article directory at /wiki/special/allpages.json. Mirrors
// the HTML Special:AllPages page as structured JSON for programmatic
// consumers (dashboards, search indexes, link rotators). The computation
// lives in scripts/allpages.js (pure function) and reuses the exact same
// `sortPagesByTitle` helper (src/lib/title-sort.js) the HTML page imports,
// so the JSON and HTML surfaces never disagree on which articles are
// listed, what their order is, or what the per-row fields are.

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
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
  const baseArticles = buildAllPages({ pages, getPageSlug, origin });

  const body = JSON.stringify(
    buildAllPagesDocument({
      origin,
      articles: baseArticles.map((article) =>
        formatArticleListingEntry({
          origin,
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          categories: article.categories,
          metrics: articleListingMetricsForSlug({
            slug: article.slug,
            metadata,
            backlinksData,
            linkgraphData,
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
