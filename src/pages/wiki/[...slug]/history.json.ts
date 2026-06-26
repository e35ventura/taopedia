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
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildArticleHistory } from '../../../../scripts/article-history-json.js';
import { gatherLinkStatsBySlug } from '../../../lib/article-link-stats';
import slugMap from '../../../../public/data/slugmap.json';

type RawRevision = { sha: string; date: string; authorName: string; message?: string };

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
  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  await Promise.all(
    publishedSlugList.map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );

  const linkStatSlugs = Object.keys(slugMap).filter((slug) => pageFromSlug(slug, slugMap));
  const { inboundBySlug, referencesCountBySlug } = gatherLinkStatsBySlug(linkStatSlugs, {
    titleBySlug,
    backlinksData,
    linkgraphData,
  });

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const revisions = historyForSlug(slug) as RawRevision[];
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
        revisions,
      },
    };
  });
}

// Machine-readable companion to /wiki/<slug>/history/. Exposes the full
// per-commit revision list (sha, date, authorName, message) that history.astro
// renders, plus computed summary fields (revisionCount, firstEdited, lastEdited,
// referencesCount) that info.json summarises or that references.json exposes as
// `count`, plus sectionCount (the toc.json `count` figure) and wordCount (the
// article footer's data-word-count), but does not break out per-revision.
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
    revisions,
  } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    revisions: RawRevision[];
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleHistory({
      slug,
      title,
      origin,
      summary,
      categories,
      incomingLinks,
      referencesCount,
      sectionCount,
      wordCount,
      revisions,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
