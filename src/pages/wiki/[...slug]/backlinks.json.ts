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
import { buildArticleBacklinks, sortInboundBacklinkEntries } from '../../../../scripts/article-backlinks.js';
import { gatherLinkStatsBySlug } from '../../../lib/article-link-stats';
import { getArticleToc } from '../../../lib/article-toc.js';
import slugMap from '../../../../public/data/slugmap.json';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const categoriesBySlug = publishedCategoriesBySlug();
  const publishedSlugs = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugs);
  // Per-slug body figures, revision history, and table-of-contents section count,
  // each carried on the envelope and every backlink entry. Scoped to published
  // slugmap members only — routes already enumerate via slugmap (#1576) — instead
  // of rendering every content-collection entry up front.
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const sectionCountBySlug: Record<string, number> = {};
  await Promise.all(
    publishedSlugs.map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  // Published inbound-link count and outbound reference count for every published
  // slug, gathered once via the shared gatherLinkStatsBySlug helper — the same
  // source links to many articles, so precomputing here keeps each source's stats
  // out of the O(articles × backlinks) entry map below.
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
    const backlinks = sortInboundBacklinkEntries(
      (backlinksData[slug] ?? [])
      .filter((entry) => titleBySlug[entry.from])
      .map((entry) => {
        const entryHistory = historyBySlug[entry.from] ?? [];
        return {
          slug: entry.from,
          title: titleBySlug[entry.from],
          summary: summaryBySlug[entry.from] ?? '',
          categories: categoriesBySlug[entry.from] ?? [],
          backlinks: inboundBySlug[entry.from] ?? 0,
          referencesCount: referencesCountBySlug[entry.from] ?? 0,
          sectionCount: sectionCountBySlug[entry.from] ?? 0,
          wordCount: wordCountBySlug[entry.from] ?? 0,
          revisionCount: entryHistory.length,
          firstEdited: entryHistory[entryHistory.length - 1]?.date ?? null,
          lastEdited: entryHistory[0]?.date ?? null,
        };
      }),
    );

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
        wordCount: wordCountBySlug[slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        backlinks,
      },
    };
  });
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and sortInboundBacklinkEntries sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const {
    slug,
    title,
    summary,
    categories,
    incomingLinks,
    referencesCount,
    sectionCount,
    wordCount,
    revisionCount,
    firstEdited,
    lastEdited,
    backlinks,
  } = props as {
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
    backlinks: Array<{
      slug: string;
      title: string;
      summary: string;
      categories: string[];
      backlinks: number;
      referencesCount: number;
      sectionCount: number;
      wordCount: number;
      revisionCount: number;
      firstEdited: string | null;
      lastEdited: string | null;
    }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleBacklinks({
      slug,
      title,
      origin,
      summary,
      categories,
      incomingLinks,
      referencesCount,
      sectionCount,
      wordCount,
      revisionCount,
      firstEdited,
      lastEdited,
      backlinks,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
