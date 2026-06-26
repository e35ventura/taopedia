import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug, revisionStatsFromHistory } from '../../../lib/article-history';
import {
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import { gatherLinkStatsBySlug } from '../../../lib/article-link-stats';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildShortPages, SHORT_PAGE_WORD_THRESHOLD } from '../../../../scripts/short-pages.js';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';
import slugMap from '../../../../public/data/slugmap.json';

// Machine-readable Special:ShortPages report at /wiki/special/shortpages.json:
// published articles at or below the stub word-count threshold, shortest first —
// the MediaWiki Special:ShortPages maintenance report this wiki lacked next to
// LonelyPages / MostLinkedPages / WantedPages. Surfaces stubs editors should
// expand. The ranking is shared through scripts/short-pages.js (pure function)
// so the endpoint and the regression check derive from one source of truth.
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
  const publishedSlugs = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugs);

  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  await Promise.all(
    publishedSlugs.map(async (slug) => {
      const page = pageBySlug[slug];
      historyBySlug[slug] = historyForSlug(slug);
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );

  const short = buildShortPages({ titleBySlug, wordCountBySlug });
  const shortSlugs = short.map((entry) => entry.slug);
  const categoriesBySlug = publishedCategoriesBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const { inboundBySlug, referencesCountBySlug } = gatherLinkStatsBySlug(shortSlugs, {
    titleBySlug,
    backlinksData,
    linkgraphData,
  });

  const body = JSON.stringify(
    {
      site: origin,
      shortpagesJsonUrl: `${origin}/wiki/special/shortpages.json`,
      threshold: SHORT_PAGE_WORD_THRESHOLD,
      count: short.length,
      pages: short.map((entry) => {
        const history = historyBySlug[entry.slug] ?? [];
        const { revisionCount, firstEdited, lastEdited } = revisionStatsFromHistory(history);
        return {
          slug: entry.slug,
          title: entry.title,
          summary: summaryBySlug[entry.slug] || null,
          ...articleJsonCompanionUrls(origin, entry.slug),
          imageUrl: `${origin}/og/${entry.slug}.png`,
          categories: [...new Set(categoriesBySlug[entry.slug] ?? [])],
          wordCount: entry.wordCount,
          readingMinutes: Math.max(1, Math.ceil(entry.wordCount / 200)),
          incomingLinks: inboundBySlug[entry.slug] ?? 0,
          referencesCount: referencesCountBySlug[entry.slug] ?? 0,
          sectionCount: sectionCountBySlug[entry.slug] ?? 0,
          revisionCount,
          firstEdited,
          lastEdited,
        };
      }),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
