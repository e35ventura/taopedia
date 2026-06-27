import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug, revisionStatsFromHistory } from '../../../lib/article-history';
import {
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildUncategorizedPages } from '../../../../scripts/uncategorized-pages.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

// Machine-readable Special:UncategorizedPages report at
// /wiki/special/uncategorizedpages.json: the uncategorized articles — published pages
// that carry NO topic category in their frontmatter — the categorization counterpart
// to Special:LonelyPages (zero INBOUND links) and Special:DeadEndPages (zero OUTBOUND
// links) and a core MediaWiki maintenance report this wiki lacked next to those.
// Surfaces pages an editor should file under a topic so they appear in the category
// hubs, the category feeds, and topic browsing. The uncategorized set is shared
// through scripts/uncategorized-pages.js (pure function) so the endpoint and the
// regression check derive from one source of truth, over the same
// public/data/slugmap.json categories the category hubs and statistics read.
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
  const categoriesBySlug = publishedCategoriesBySlug();
  const uncategorized = buildUncategorizedPages({ titleBySlug, categoriesBySlug });

  // summary comes from public/data/slugmap.json for uncategorized slugs only — the
  // same artifact lonelypages.json / deadendpages.json read — instead of copying
  // page.data for every published article up front.
  const uncategorizedSlugs = new Set(uncategorized.map((entry) => entry.slug));
  const summaryBySlug = publishedSummaryBySlug();
  const pageBySlug = await contentPagesBySlug(uncategorizedSlugs);

  // Gather each uncategorized page's section count, word count, and revision history
  // in a single pass over the list, mirroring lonelypages.json / deadendpages.json.
  // History is read before the no-page guard so every entry still gets a history
  // record (the render step is what requires a resolved page).
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const entry of uncategorized) {
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
      uncategorizedpagesJsonUrl: `${origin}/wiki/special/uncategorizedpages.json`,
      count: uncategorized.length,
      pages: uncategorized.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        // Empty by definition — an uncategorized page carries no topic category.
        // Emitted under the same cross-endpoint name info.json / references.json use
        // so a consumer reads it under one key and can confirm the invariant.
        categories: [],
        // An uncategorized page may still be linked TO and may still link OUT, so both
        // counts are meaningful and enriched here: incomingLinks is the same
        // published-only, self-excluded inbound count info.json / mostlinkedpages.json
        // expose, and referencesCount the same published-only outbound count
        // info.json / references.json expose — so an editor can gauge how connected an
        // uncategorized page already is before filing it under a topic.
        incomingLinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
        referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The page's estimated reading time in minutes — the same ~200 wpm ceil
        // estimate info.json exposes and the article footer renders from wordCount,
        // so an editor can spot short stubs among the uncategorized without a second
        // fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The page's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose — so an editor can gauge each page's age and recency.
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
