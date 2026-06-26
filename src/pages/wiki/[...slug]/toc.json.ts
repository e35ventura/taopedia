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
import { gatherLinkStatsBySlug } from '../../../lib/article-link-stats';
import { buildArticleToc, getArticleToc } from '../../../lib/article-toc.js';
import slugMap from '../../../../public/data/slugmap.json';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const categoriesBySlug = publishedCategoriesBySlug();
  const publishedSlugList = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugList);
  // Per-slug body word count, revision history, and table-of-contents sections —
  // scoped to published slugmap members instead of rendering every collection entry.
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const sectionsBySlug: Record<string, ReturnType<typeof getArticleToc>> = {};
  await Promise.all(
    publishedSlugList.map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionsBySlug[slug] = getArticleToc(headings);
    }),
  );
  // Published inbound-link count and outbound reference count for every published
  // slug, gathered via the shared gatherLinkStatsBySlug helper.
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
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        referencesCount: referencesCountBySlug[slug] ?? 0,
        wordCount: wordCountBySlug[slug] ?? 0,
        sections: sectionsBySlug[slug] ?? [],
      },
    };
  });
}

// Machine-readable companion to the rendered article contents sidebar. It uses
// the same shared TOC helper the article page consumes, so the visibility,
// numbering, and deep-link contract live in one runtime source of truth.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, referencesCount, wordCount, sections } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    referencesCount: number;
    wordCount: number;
    sections: Array<{ number: number; depth: number; slug: string; title: string }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleToc({ slug, title, origin, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, referencesCount, wordCount, sections }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
