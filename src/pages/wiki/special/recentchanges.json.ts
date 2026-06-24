import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, allRecentChanges } from '../../../lib/article-history';
import { RECENT_LIMIT } from '../../../lib/recent-changes.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';

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

  const titleBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  const summaryBySlug: Record<string, string> = {};
  const pageBySlug: Record<string, (typeof pages)[number]> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    categoriesBySlug[slug] = page.data.categories ?? [];
    summaryBySlug[slug] = page.data.summary ?? '';
    pageBySlug[slug] = page;
  }

  const changes = allRecentChanges(titleBySlug, RECENT_LIMIT);

  // sectionCount is the changed article's table-of-contents section count — the
  // same figure toc.json exposes as `count` and info.json / history.json expose
  // on their envelopes, derived from the shared getArticleToc helper. Rendered
  // only for the changed articles in the feed so a change-feed consumer can gauge
  // each article's depth without a second fetch. Cached per slug because an
  // article can appear in multiple changes.
  const sectionCountBySlug: Record<string, number> = {};
  for (const change of changes) {
    if (change.slug in sectionCountBySlug) continue;
    const page = pageBySlug[change.slug];
    if (!page) continue;
    const { headings } = await render(page);
    sectionCountBySlug[change.slug] = getArticleToc(headings).length;
  }
  const dateRange =
    changes.length > 0
      ? { newest: changes[0].date, oldest: changes[changes.length - 1].date }
      : { newest: '', oldest: '' };

  const body = JSON.stringify(
    {
      site: origin,
      recentchangesJsonUrl: `${origin}/wiki/special/recentchanges.json`,
      feedUrl: `${origin}/wiki/special/recentchanges/feed.json`,
      atomUrl: `${origin}/wiki/special/recentchanges/atom.xml`,
      rssUrl: `${origin}/wiki/special/recentchanges/rss.xml`,
      limit: RECENT_LIMIT,
      count: changes.length,
      dateRange,
      changes: changes.map((change) => ({
        id: `urn:taopedia:recentchanges:${change.slug}:${change.sha}`,
        slug: change.slug,
        title: change.title,
        summary: summaryBySlug[change.slug] || null,
        url: `${origin}/wiki/${change.slug}/`,
        infoUrl: `${origin}/wiki/${change.slug}/info/`,
        infoJsonUrl: `${origin}/wiki/${change.slug}/info.json`,
        backlinksUrl: `${origin}/wiki/${change.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${change.slug}/backlinks.json`,
        historyUrl: `${origin}/wiki/${change.slug}/history/`,
        historyJsonUrl: `${origin}/wiki/${change.slug}/history.json`,
        citeUrl: `${origin}/wiki/${change.slug}/cite/`,
        citeJsonUrl: `${origin}/wiki/${change.slug}/cite.json`,
        bibtexUrl: `${origin}/wiki/${change.slug}/cite.bib`,
        referencesUrl: `${origin}/wiki/${change.slug}/references.json`,
        relatedUrl: `${origin}/wiki/${change.slug}/related.json`,
        tocJsonUrl: `${origin}/wiki/${change.slug}/toc.json`,
        imageUrl: `${origin}/og/${change.slug}.png`,
        categories: categoriesBySlug[change.slug] ?? [],
        backlinks: publishedInboundLinkCount(backlinksData, change.slug, titleBySlug),
        // referencesCount is the changed article's published OUTBOUND reference
        // count — the complement of backlinks (its inbound count) — using the same
        // getArticleReferences helper (published-only join) that references.json /
        // cite.json / info.json use, so a feed consumer can see both directions of
        // each changed article's link degree without a second fetch.
        referencesCount: getArticleReferences({ slug: change.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[change.slug] ?? 0,
        date: change.date,
        authorName: change.authorName,
        sha: change.sha,
        message: change.message ?? '',
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
