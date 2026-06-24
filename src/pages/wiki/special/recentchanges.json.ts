import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, allRecentChanges, historyForSlug } from '../../../lib/article-history';
import { RECENT_LIMIT } from '../../../lib/recent-changes.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import {
  articleListingMetricsForSlug,
  buildRecentChangesDocument,
  formatArticleListingEntry,
} from '../../../../scripts/article-listing.js';
import { getListingArticleSlugMetadata } from '../../../../scripts/listing-metadata-cache.js';

// The inbound-link graph is the same public/data/backlinks.json the HTML
// "What links here" page, allpages.json, mostlinkedpages.json, subnets.json and
// the per-article listings read, so the per-change inbound count below uses the
// exact published-only, orphan-skipping count those surfaces use.
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

// Machine-readable site-wide recent changes at /wiki/special/recentchanges.json.
// Mirrors the HTML Special:RecentChanges feed as structured JSON for programmatic
// consumers (dashboards, change monitors, cross-referencing tools), alongside the
// statistics/categories/mostlinkedpages/allpages JSON endpoints. It reuses the
// exact allRecentChanges() builder (src/lib/article-history) and RECENT_LIMIT the
// HTML page consumes, so the JSON and HTML feeds never disagree.

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
  const changes = allRecentChanges(metadata.titleBySlug, RECENT_LIMIT);
  const dateRange =
    changes.length > 0
      ? { newest: changes[0].date, oldest: changes[changes.length - 1].date }
      : { newest: '', oldest: '' };

  const body = JSON.stringify(
    buildRecentChangesDocument({
      origin,
      limit: RECENT_LIMIT,
      dateRange,
      changes: changes.map((change) => ({
        id: `urn:taopedia:recentchanges:${change.slug}:${change.sha}`,
        ...formatArticleListingEntry({
          origin,
          slug: change.slug,
          title: change.title,
          summary: metadata.summaryBySlug[change.slug] ?? '',
          categories: metadata.categoriesBySlug[change.slug] ?? [],
          metrics: articleListingMetricsForSlug({
            slug: change.slug,
            metadata,
            backlinksData,
            linkgraphData,
          }),
        }),
        date: change.date,
        authorName: change.authorName,
        sha: change.sha,
        message: change.message ?? '',
      })),
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
