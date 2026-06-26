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
import { buildArticleInfo } from '../../../../scripts/article-info.js';
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
  const publishedSlugList = Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
  const pageBySlug = await contentPagesBySlug(publishedSlugList);
  // Per-slug body word count, revision history, and table-of-contents section
  // count — scoped to published slugmap members instead of rendering every
  // content-collection entry up front.
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
        // Precomputed once per route in getStaticPaths — the same figures the
        // GET handler used to re-derive on every info.json build by calling
        // getCollection + render again. Matches history.json / cite.json.
        incomingLinks: inboundBySlug[slug] ?? 0,
        referencesCount: referencesCountBySlug[slug] ?? 0,
        sectionCount: sectionCountBySlug[slug] ?? 0,
        wordCount: wordCountBySlug[slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      },
    };
  });
}

// Machine-readable companion to /wiki/<slug>/info/. It mirrors the existing
// Page-information surface using the same build artifacts the HTML page reads:
// page frontmatter, public/history/<slug>.json, and public/data/backlinks.json.
// No new pipeline is introduced, and only data already exposed in the UI is
// serialized.
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
  };

  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleInfo({
      title,
      slug,
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
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
