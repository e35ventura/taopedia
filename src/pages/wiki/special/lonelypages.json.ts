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
import { buildLonelyPages } from '../../../../scripts/lonely-pages.js';
import { uniqueFeedCategories } from '../../../lib/feed-categories.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

// Machine-readable Special:LonelyPages report at /wiki/special/lonelypages.json:
// the orphaned articles — published pages that NO other published article links to
// (zero inbound links) — the exact complement of Special:MostLinkedPages and a core
// MediaWiki maintenance report this wiki lacked next to MostLinkedPages / WantedPages
// / AllPages / RecentChanges. Surfaces pages editors should wire into the link graph.
// The orphan set is shared through scripts/lonely-pages.js (pure function) so the
// endpoint and the regression check derive from one source of truth, over the same
// public/data/backlinks.json the MostLinkedPages surfaces read.
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
  const lonely = buildLonelyPages({ titleBySlug, backlinks: backlinksData });

  // categories/summary come from public/data/slugmap.json for orphaned slugs only —
  // the same artifact mostlinkedpages.json reads — instead of copying page.data for
  // every published article up front.
  const lonelySlugs = new Set(lonely.map((entry) => entry.slug));
  const categoriesBySlug = publishedCategoriesBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const pageBySlug = await contentPagesBySlug(lonelySlugs);

  // Gather each orphan's section count, word count, and revision history in a single
  // pass over the orphan list, mirroring mostlinkedpages.json. History is read before
  // the no-page guard so every orphan still gets a history entry (the render step is
  // what requires a resolved page).
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const entry of lonely) {
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
      lonelypagesJsonUrl: `${origin}/wiki/special/lonelypages.json`,
      count: lonely.length,
      pages: lonely.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        // Dedupe repeated frontmatter topics so the directory cannot list the same
        // category twice, matching the info.json / toc.json / related.json envelopes
        // this entry is cross-checked against.
        categories: uniqueFeedCategories(categoriesBySlug[entry.slug]),
        // Zero by definition — an orphan is a page with no published inbound links.
        // Emitted under the same cross-endpoint name info.json / references.json use
        // so a consumer reads it under one key and can confirm the orphan invariant.
        incomingLinks: 0,
        // referencesCount is the orphan's published OUTBOUND reference count — an
        // orphan has no inbound links but may still link OUT — using the same
        // getArticleReferences helper (published-only join) info.json / cite.json use,
        // so an editor can see whether the page is a true dead-end or just unlinked-to.
        referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The orphan's estimated reading time in minutes — the same ~200 wpm ceil
        // estimate info.json exposes and the article footer renders from wordCount,
        // so an editor can spot short stubs among the orphans without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The orphan's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose — so an editor can gauge each orphan's age and recency.
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
