import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { historyForSlug } from '../../../lib/article-history';
import { contentPagesBySlug } from '../../../lib/content-pages-by-slug';
import {
  pageFromSlug,
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { buildArticleRelatedPages, getRelatedPages } from '../../../lib/related-pages';
import { gatherLinkStatsBySlug } from '../../../lib/article-link-stats';
import { getArticleToc } from '../../../lib/article-toc.js';

const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string; categories?: string[]; summary?: string }> }
>;
const categoriesModules = import.meta.glob('../../../../public/data/categories.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
>;

const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const categoriesIndex = Object.values(categoriesModules)[0]?.default ?? {};
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const categoriesBySlug = publishedCategoriesBySlug();
  const publishedSlugs = new Set(Object.keys(titleBySlug));
  const publishedSlugList = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugList);
  // Body word count, revision history, and table-of-contents section count —
  // scoped to published slugmap members (routes already enumerate via slugmap
  // in #1607) instead of rendering every content-collection entry up front.
  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  await Promise.all(
    publishedSlugList.map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  // Published inbound-link count and outbound reference count for every published
  // slug, gathered via the shared gatherLinkStatsBySlug helper, keeping each target's
  // stats out of the O(articles × related) entry map below.
  const linkStatSlugs = Object.keys(slugMap).filter((slug) => pageFromSlug(slug, slugMap));
  const { inboundBySlug, referencesCountBySlug } = gatherLinkStatsBySlug(linkStatSlugs, {
    titleBySlug,
    backlinksData,
    linkgraphData,
  });

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const history = historyBySlug[slug] ?? [];
    return {
      params: { slug },
      props: {
        slug,
        title: titleBySlug[slug] ?? page.data.title,
        summary: summaryBySlug[slug] ?? '',
        categories: categoriesBySlug[slug] ?? [],
          incomingLinks: inboundBySlug[slug] ?? 0,
          referencesCount: referencesCountBySlug[slug] ?? 0,
          sectionCount: sectionCountBySlug[slug] ?? 0,
          // The article body's word count — the same figure info.json / history.json
          // expose and the article-page footer (mw-article-meta data-word-count)
          // renders. Read from the wordCountBySlug map already built above (it
          // covers every page, including this one) instead of recomputing the
          // split/filter pass a second time for the same page.
          wordCount: wordCountBySlug[slug] ?? 0,
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
          relatedPages: getRelatedPages({
            slug,
            slugMap,
            categoriesIndex,
            backlinks: backlinksData,
            outgoing: linkgraphData,
            publishedSlugs,
            titleBySlug,
          }).map((entry) => {
            const entryHistory = historyBySlug[entry.slug] ?? [];
            return {
              ...entry,
              categories: slugMap[entry.slug]?.categories ?? [],
              backlinks: inboundBySlug[entry.slug] ?? 0,
              referencesCount: referencesCountBySlug[entry.slug] ?? 0,
              sectionCount: sectionCountBySlug[entry.slug] ?? 0,
              wordCount: wordCountBySlug[entry.slug] ?? 0,
              revisionCount: entryHistory.length,
              firstEdited: entryHistory[entryHistory.length - 1]?.date ?? null,
              lastEdited: entryHistory[0]?.date ?? null,
            };
          }),
        },
      };
  });
}

// Machine-readable companion to the article-level "Related pages" block. It
// reuses the same build-time helper as /wiki/<slug>/ so the recommendation set,
// ordering, summaries, and topic tags stay aligned without introducing an HTML
// subpage or any visual diff.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, referencesCount, sectionCount, wordCount, revisionCount, firstEdited, lastEdited, relatedPages } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    relatedPages: Array<{ slug: string; title: string; summary: string; tags: string[]; categories: string[]; backlinks: number; referencesCount: number; sectionCount: number; wordCount: number; revisionCount: number; firstEdited: string | null; lastEdited: string | null }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(buildArticleRelatedPages({ slug, title, origin, summary, categories, incomingLinks, referencesCount, sectionCount, wordCount, revisionCount, firstEdited, lastEdited, relatedPages }), null, 2);

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
