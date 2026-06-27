import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug, revisionStatsFromHistory } from '../../../lib/article-history';
import { uniqueFeedCategories } from '../../../lib/feed-categories.js';
import {
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildMostLinkedPages } from '../../../../scripts/most-linked.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

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
  const titleBySlug = publishedTitleBySlug();
  const ranked = buildMostLinkedPages({ backlinks: backlinksData, titleBySlug });

  // categories/summary come from public/data/slugmap.json for ranked slugs only —
  // the same artifact search-data.json (#1405) reads — instead of copying
  // page.data for every published article up front.
  const rankedSlugs = new Set(ranked.map((entry) => entry.slug));
  const categoriesBySlug = publishedCategoriesBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const pageBySlug = await contentPagesBySlug(rankedSlugs);

  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json / history.json expose on
  // their envelopes, derived from the shared getArticleToc helper. Rendered only
  // for the ranked pages so a consumer can gauge each top page's depth (how many
  // sections it has) alongside its link popularity without a second fetch.
  // Gather each ranked page's section count and revision history in a single pass
  // over the ranked list. These were two separate loops over `ranked`; the history
  // read is folded into the render pass so the list is traversed once. History is
  // read before the no-page guard so every ranked entry still gets a history entry
  // (the render/sectionCount step is what requires a resolved page), keeping the
  // output byte-identical.
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const entry of ranked) {
    historyBySlug[entry.slug] = historyForSlug(entry.slug);
    const page = pageBySlug[entry.slug];
    if (!page) continue;
    const { headings } = await render(page);
    sectionCountBySlug[entry.slug] = getArticleToc(headings).length;
    wordCountBySlug[entry.slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  }

  const body = JSON.stringify(
    {
      site: origin,
      mostlinkedpagesJsonUrl: `${origin}/wiki/special/mostlinkedpages.json`,
      count: ranked.length,
      pages: ranked.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        categories: uniqueFeedCategories(categoriesBySlug[entry.slug]),
        backlinks: entry.count,
        // incomingLinks is the same published-only inbound-link count exposed
        // under `backlinks`, aliased to the key name info.json / references.json /
        // backlinks.json use ("incomingLinks"), so a consumer can read it under the
        // consistent cross-endpoint name. `backlinks` is kept for back-compat.
        incomingLinks: entry.count,
        // referencesCount is the article's published OUTBOUND reference count —
        // the complement of backlinks (its inbound count) — using the same
        // getArticleReferences helper (published-only join) that references.json /
        // cite.json / info.json use, so a consumer of the ranking can see both
        // directions of each top page's link degree without a second fetch.
        referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The article's estimated reading time in minutes — the same ~200 wpm
        // ceil estimate info.json exposes and the article-page footer renders
        // from wordCount, so a consumer of the ranking can gauge each top page's
        // reading time without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The article's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose per article and allpages.json exposes per directory entry — so a
        // consumer of the ranking can see each top page's age and recency without
        // a second fetch.
        ...revisionStatsFromHistory(historyBySlug[entry.slug] ?? []),
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
