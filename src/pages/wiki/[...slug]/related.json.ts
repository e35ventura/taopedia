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
  // Per-entry wordCount: each related article's body word count — the same
  // figure info.json / history.json expose and allpages.json / subnets.json
  // expose per directory entry. Built once from the content collection.
  const wordCountBySlug = Object.fromEntries(
    pages.map((page) => [getPageSlug(page), (page.body ?? '').trim().split(/\s+/).filter(Boolean).length]),
  );
  // Per-slug table-of-contents section count — the same sectionCount info.json /
  // history.json expose (and the toc.json `count`). Built once from the content
  // collection so both the envelope and each related entry can carry it.
  const sectionCountBySlug = Object.fromEntries(
    await Promise.all(pages.map(async (page) => [getPageSlug(page), getArticleToc((await render(page)).headings).length])),
  );

  return Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const history = historyForSlug(slug);
      return {
        params: { slug },
        props: {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
          incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
          referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
          sectionCount: sectionCountBySlug[slug] ?? 0,
          // The article body's word count — the same figure info.json / history.json
          // expose and the article-page footer (mw-article-meta data-word-count) renders.
          wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
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
            const entryHistory = historyForSlug(entry.slug);
            return {
              ...entry,
              categories: slugMap[entry.slug]?.categories ?? [],
              backlinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
              referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
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
