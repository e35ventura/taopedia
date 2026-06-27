import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug, revisionStatsFromHistory } from '../../../lib/article-history';
import {
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildDeadEndPages } from '../../../../scripts/dead-end-pages.js';
import { uniqueFeedCategories } from '../../../lib/feed-categories.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

// Machine-readable Special:DeadEndPages report at /wiki/special/deadendpages.json:
// the dead-end articles — published pages that link OUT to no other published article
// (zero outbound references) — the navigation counterpart to Special:LonelyPages (zero
// INBOUND links) and a core MediaWiki maintenance report. Surfaces reading cul-de-sacs
// editors should wire into the link graph. The dead-end set is shared through
// scripts/dead-end-pages.js (pure function) so the endpoint and the regression check
// derive from one source of truth, over the same public/data/linkgraph.json the
// references / most-linked surfaces read.
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const titleBySlug = publishedTitleBySlug();
  const deadEnds = buildDeadEndPages({ titleBySlug, linkGraph: linkgraphData });

  // categories/summary come from public/data/slugmap.json for dead-end slugs only —
  // the same artifact mostlinkedpages.json / lonelypages.json read — instead of
  // copying page.data for every published article up front.
  const deadEndSlugs = new Set(deadEnds.map((entry) => entry.slug));
  const categoriesBySlug = publishedCategoriesBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const pageBySlug = await contentPagesBySlug(deadEndSlugs);

  // Gather each dead-end's section count, word count, and revision history in a
  // single pass over the dead-end list, mirroring mostlinkedpages.json /
  // lonelypages.json. History is read before the no-page guard so every dead-end
  // still gets a history entry (the render step is what requires a resolved page).
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const entry of deadEnds) {
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
      deadendpagesJsonUrl: `${origin}/wiki/special/deadendpages.json`,
      count: deadEnds.length,
      pages: deadEnds.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        // Dedupe repeated frontmatter topics so the directory cannot list the same
        // category twice, matching the info.json / toc.json / related.json envelopes
        // this entry is cross-checked against.
        categories: uniqueFeedCategories(categoriesBySlug[entry.slug]),
        // A dead-end may still be linked TO, so its inbound count is meaningful and
        // enriched here (the same published-only, self-excluded count info.json /
        // mostlinkedpages.json expose) — it is the OUTBOUND count that is zero.
        incomingLinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
        // Zero by definition — a dead-end links out to no published article. Emitted
        // under the same cross-endpoint name info.json / references.json use so a
        // consumer reads it under one key and can confirm the dead-end invariant.
        referencesCount: 0,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The dead-end's estimated reading time in minutes — the same ~200 wpm ceil
        // estimate info.json exposes and the article footer renders from wordCount,
        // so an editor can spot short stubs among the dead-ends without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The dead-end's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose — so an editor can gauge each dead-end's age and recency.
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
