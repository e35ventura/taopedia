import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildArticleRelatedPages, getRelatedPages } from '../../../lib/related-pages';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { getArticleReferences } from '../../../lib/article-references.js';
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
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));
  const publishedSlugs = new Set(Object.keys(titleBySlug));
  // Gather each article's body word count, table-of-contents section count, and
  // revision history in a single pass over the content collection — these were
  // three separate loops over `pages`. The wordCount and history reads are folded
  // into the render pass (rendering is what requires a resolved page), kept parallel
  // via Promise.all so the render step is not serialized. Each is a per-slug stat
  // the envelope and related entries carry (the same figures info.json /
  // history.json / toc.json expose); output is byte-identical.
  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  await Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  // Published inbound-link count and outbound reference count, gathered in a single
  // pass after titleBySlug is built (both resolve titles through it). These were two
  // separate loops; getArticleReferences is a full link-graph join, so computing
  // both per slug here keeps each target's stats out of the O(articles × related)
  // entry map below.
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }

  return Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const history = historyBySlug[slug] ?? [];
      return {
        params: { slug },
        props: {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
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
    }),
  );
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
