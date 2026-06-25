import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, allRecentChanges, historyForSlug } from '../../../lib/article-history';
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
  const pageBySlug: Record<string, (typeof pages)[number]> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
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
  // wordCount is the changed article's body word count — the same figure
  // info.json exposes and the article-page footer (mw-article-meta
  // data-word-count) renders, computed from the raw markdown body so a change-
  // feed consumer can gauge each article's length without a second fetch.
  // Computed here (gated to the slugs that actually appear in the feed, ≤
  // RECENT_LIMIT) rather than splitting every article body in the collection up
  // front — the same compute-only-for-feed-members pattern sectionCount /
  // revisionStats / inbound / references below already follow. Cached per slug
  // because an article can appear in multiple changes.
  const wordCountBySlug: Record<string, number> = {};
  // categories/summary are only ever read by change.slug below (≤ RECENT_LIMIT
  // entries), but were previously copied from page.data for every one of the
  // ~350 published articles up front. Gated into this same feed-members-only
  // loop, the same compute-only-for-feed-members pattern as wordCount above.
  const categoriesBySlug: Record<string, string[]> = {};
  const summaryBySlug: Record<string, string> = {};
  // Promise.all keeps the render step concurrent instead of serialized — a
  // sequential for-await loop would render each changed article one at a time.
  // Same parallelization the per-article endpoints (info.json, backlinks.json,
  // references.json, etc.) and allpages.json already rely on. Dedupe to unique
  // slugs first (an article can appear in multiple changes) so each page is
  // still rendered exactly once, matching the original loop's dedup guard.
  const uniqueChangedSlugs = [...new Set(changes.map((change) => change.slug))];
  await Promise.all(
    uniqueChangedSlugs.map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      categoriesBySlug[slug] = page.data.categories ?? [];
      summaryBySlug[slug] = page.data.summary ?? '';
    }),
  );
  // revisionCount/firstEdited/lastEdited are the changed article's own commit-
  // history stats (history is newest-first) — the same trio info.json /
  // allpages.json expose per article, and mostlinkedpages.json / subnets.json /
  // category articles.json expose per directory entry — so a change-feed
  // consumer can see the changed article's overall edit age/activity, not just
  // this one change's date, without a second fetch. Cached per slug because an
  // article can appear in multiple changes.
  // inbound link count (exposed as both `backlinks` and the `incomingLinks`
  // alias) and outbound reference count, cached once per slug like
  // sectionCountBySlug above — an article can appear in multiple changes, and the
  // inbound count was otherwise computed twice per entry (once for each key)
  // while getArticleReferences is a full link-graph join. These three stat maps
  // are gathered in a single pass over the change feed: history, inbound and
  // references are all keyed by the change's slug and need no resolved page (only
  // sectionCount above does), so they were folded out of two separate change
  // loops into one. Same compute-once pattern subnets.json / mostlinkedpages.json
  // use.
  const revisionStatsBySlug: Record<string, { revisionCount: number; firstEdited: string | null; lastEdited: string | null }> = {};
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const change of changes) {
    if (change.slug in revisionStatsBySlug) continue;
    const history = historyForSlug(change.slug);
    revisionStatsBySlug[change.slug] = {
      revisionCount: history.length,
      firstEdited: history[history.length - 1]?.date ?? null,
      lastEdited: history[0]?.date ?? null,
    };
    inboundBySlug[change.slug] = publishedInboundLinkCount(backlinksData, change.slug, titleBySlug);
    referencesCountBySlug[change.slug] = getArticleReferences({ slug: change.slug, linkGraph: linkgraphData, titleBySlug }).length;
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
      // feedJsonUrl is the same JSON Feed link under the consistent <name>JsonUrl
      // key every other JSON companion uses (recentchangesJsonUrl, articlesJsonUrl,
      // infoJsonUrl, historyJsonUrl). feedUrl was the lone outlier naming it without
      // the Json suffix; it is kept for backwards compatibility and feedJsonUrl is
      // the consistent name.
      feedJsonUrl: `${origin}/wiki/special/recentchanges/feed.json`,
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
        // referencesJsonUrl / relatedJsonUrl are the consistently-named `*JsonUrl`
        // aliases for referencesUrl / relatedUrl, matching the infoJsonUrl /
        // backlinksJsonUrl / citeJsonUrl / tocJsonUrl companions this same change
        // entry already exposes. references.json / related.json have no HTML page,
        // so referencesUrl / relatedUrl already point at the .json — these add the
        // sibling-consistent name. referencesUrl / relatedUrl are kept for back-compat.
        referencesJsonUrl: `${origin}/wiki/${change.slug}/references.json`,
        relatedJsonUrl: `${origin}/wiki/${change.slug}/related.json`,
        tocJsonUrl: `${origin}/wiki/${change.slug}/toc.json`,
        imageUrl: `${origin}/og/${change.slug}.png`,
        categories: categoriesBySlug[change.slug] ?? [],
        backlinks: inboundBySlug[change.slug] ?? 0,
        // incomingLinks is the same published-only inbound-link count exposed
        // under `backlinks`, aliased to the key name info.json / references.json /
        // backlinks.json use ("incomingLinks"), so a feed consumer can read it
        // under the consistent cross-endpoint name. `backlinks` is kept for back-compat.
        incomingLinks: inboundBySlug[change.slug] ?? 0,
        // referencesCount is the changed article's published OUTBOUND reference
        // count — the complement of backlinks (its inbound count) — using the same
        // getArticleReferences helper (published-only join) that references.json /
        // cite.json / info.json use, so a feed consumer can see both directions of
        // each changed article's link degree without a second fetch.
        referencesCount: referencesCountBySlug[change.slug] ?? 0,
        sectionCount: sectionCountBySlug[change.slug] ?? 0,
        wordCount: wordCountBySlug[change.slug] ?? 0,
        // readingMinutes is the changed article's estimated reading time — the
        // same ~200 wpm ceil formula the article-page footer ("N min read") and
        // info.json / toc.json / history.json expose from wordCount, so a change-
        // feed consumer can gauge each article's reading time without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[change.slug] ?? 0) / 200)),
        revisionCount: revisionStatsBySlug[change.slug]?.revisionCount ?? 0,
        firstEdited: revisionStatsBySlug[change.slug]?.firstEdited ?? null,
        lastEdited: revisionStatsBySlug[change.slug]?.lastEdited ?? null,
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
