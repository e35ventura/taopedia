import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug } from '../../../lib/article-history';
import {
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildDeadEndPages } from '../../../../scripts/dead-end-pages.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

// Machine-readable Special:DeadendPages report at /wiki/special/deadendpages.json:
// the dead-end articles — published pages that link OUT to no other published
// article (zero outbound references) — the outbound-side mirror of the inbound
// Special:LonelyPages report and a core MediaWiki maintenance report this wiki
// lacked next to LonelyPages / MostLinkedPages / WantedPages / AllPages. Surfaces
// pages editors should wire INTO the link graph from the inside out. The dead-end
// set is shared through scripts/dead-end-pages.js (pure function) so the endpoint
// and the regression check derive from one source of truth, over the same
// public/data/linkgraph.json the references.json surfaces read.
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
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
  const deadEnd = buildDeadEndPages({ titleBySlug, linkGraph: linkgraphData });

  // categories/summary come from public/data/slugmap.json for dead-end slugs only —
  // the same artifact lonelypages.json reads — instead of copying page.data for
  // every published article up front.
  const deadEndSlugs = new Set(deadEnd.map((entry) => entry.slug));
  const categoriesBySlug = publishedCategoriesBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const pageBySlug = await contentPagesBySlug(deadEndSlugs);

  // Gather each dead-end's section count, word count, and revision history in a
  // single pass over the list, mirroring lonelypages.json. History is read before
  // the no-page guard so every dead-end still gets a history entry (the render step
  // is what requires a resolved page).
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const entry of deadEnd) {
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
      count: deadEnd.length,
      pages: deadEnd.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        // Dedupe repeated frontmatter topics so the directory cannot list the same
        // category twice, matching the info.json / toc.json / lonelypages.json
        // envelopes this entry is cross-checked against.
        categories: [...new Set(categoriesBySlug[entry.slug] ?? [])],
        // A dead-end page may still be linked TO — surface its published inbound
        // count (the same publishedInboundLinkCount info.json / lonelypages.json use)
        // so an editor can tell a well-cited dead-end from a true island (a page
        // that is both lonely AND dead-end, with zero links in or out).
        incomingLinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
        // Zero by definition — a dead-end links OUT to no published article. Emitted
        // under the same cross-endpoint name info.json / references.json use, and
        // re-derived (not hard-coded) with the same getArticleReferences published-only
        // join the builder uses so a consumer can confirm the dead-end invariant.
        referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The dead-end's estimated reading time in minutes — the same ~200 wpm ceil
        // estimate info.json exposes and the article footer renders from wordCount,
        // so an editor can spot short stubs among the dead-ends without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The dead-end's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose — so an editor can gauge each dead-end's age and recency.
        revisionCount: historyBySlug[entry.slug]?.length ?? 0,
        firstEdited: historyBySlug[entry.slug]?.at(-1)?.date ?? null,
        lastEdited: historyBySlug[entry.slug]?.[0]?.date ?? null,
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
