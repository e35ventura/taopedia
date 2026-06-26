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
import { buildArticleReferences, getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import slugMap from '../../../../public/data/slugmap.json';

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

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const categoriesBySlug = publishedCategoriesBySlug();
  const publishedSlugList = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugList);
  // Body word count, revision history, and table-of-contents section count —
  // scoped to published slugmap members (routes already enumerate via slugmap
  // in #1606) instead of rendering every content-collection entry up front.
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const sectionCountBySlug: Record<string, number> = {};
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
  // Published inbound-link count and outbound reference list, gathered in a
  // single pass after titleBySlug is built (both resolve targets through it).
  // The same target recurs across many articles' reference lists, so computing
  // these inside the entry map below would recompute each target's stats once
  // per referencing article (O(articles × references)) — and getArticleReferences
  // is a full link-graph join. referencesBySlug caches the full list (not just
  // its length) so the main loop can reuse the current page's own outbound list
  // directly instead of calling getArticleReferences a second time.
  const inboundBySlug: Record<string, number> = {};
  const referencesBySlug: Record<string, ReturnType<typeof getArticleReferences>> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const slug of Object.keys(slugMap)) {
    if (!pageFromSlug(slug, slugMap)) continue;
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug });
    referencesCountBySlug[slug] = referencesBySlug[slug].length;
  }

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const references = (referencesBySlug[slug] ?? []).map((ref) => {
      const history = historyBySlug[ref.slug] ?? [];
      return {
        ...ref,
        summary: summaryBySlug[ref.slug] ?? '',
        categories: categoriesBySlug[ref.slug] ?? [],
        backlinks: inboundBySlug[ref.slug] ?? 0,
        referencesCount: referencesCountBySlug[ref.slug] ?? 0,
        sectionCount: sectionCountBySlug[ref.slug] ?? 0,
        wordCount: wordCountBySlug[ref.slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      };
    });
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
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        sectionCount: sectionCountBySlug[slug] ?? 0,
        wordCount: wordCountBySlug[slug] ?? 0,
        references,
      },
    };
  });
}

// Machine-readable per-article outbound-reference index. Exposes the published
// article targets referenced by /wiki/<slug>/ using the same build-time link
// graph that powers backlinks.json, without advertising an HTML subpage that
// does not exist.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, referencesCount, revisionCount, firstEdited, lastEdited, sectionCount, wordCount, references } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    referencesCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    sectionCount: number;
    wordCount: number;
    references: Array<{
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
    buildArticleReferences({ slug, title, origin, summary, categories, incomingLinks, referencesCount, revisionCount, firstEdited, lastEdited, sectionCount, wordCount, references }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
