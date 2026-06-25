import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { buildCategoryArticlesDocument, getCategoryArticles } from '../../../../lib/category-articles.js';
import { publishedInboundLinkCount } from '../../../../../scripts/most-linked.js';
import { getPageSlug, historyForSlug } from '../../../../lib/article-history';
import { getArticleReferences } from '../../../../lib/article-references.js';
import { getArticleToc } from '../../../../lib/article-toc.js';

const categoriesModules = import.meta.glob('../../../../../public/data/categories.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const linkgraphModules = import.meta.glob('../../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const slugmapModules = import.meta.glob('../../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string; summary?: string }> }
>;
const backlinksModules = import.meta.glob('../../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;

const categoriesIndex = Object.values(categoriesModules)[0]?.default ?? {};
const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};
const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
);

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  // The article body's word count — the same figure info.json exposes and the
  // article-page footer (mw-article-meta data-word-count) renders, computed from
  // the raw markdown body so a category consumer can sort or filter the list by
  // article length without an N-fetch sweep.
  const pages = await getCollection('pages');
  // Gather each article's body word count, table-of-contents section count, and
  // revision history in a single pass over the content collection — these were
  // three separate loops. The wordCount and history reads are folded into the
  // render pass (rendering is what requires a resolved page), kept parallel via
  // Promise.all so the render step is not serialized. sectionCount is the same
  // figure toc.json exposes as `count`; each is a per-entry stat the list carries.
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
  // pass (both resolve titles through titleBySlug). These were two separate loops;
  // getArticleReferences is a full link-graph join. Precomputing them per slug here
  // keeps each article's stats out of the per-category article loop below, which
  // would otherwise recompute them once per category membership (an article in N
  // categories is visited N times).
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }
  return Object.keys(categoriesIndex)
    .sort()
    .map((categoryName) => ({
      params: { category: categorySlug(categoryName) },
      props: {
        categoryName,
        categoryPath: categorySlug(categoryName),
        articles: getCategoryArticles({ categoryName, categoriesIndex, slugMap }).map((article) => {
          // History is newest-first, so [0] is the latest revision and the last
          // entry is the original publication — the same revisionCount /
          // firstEdited / lastEdited per-entry stats references.json and
          // allpages.json expose for each entry.
          const history = historyBySlug[article.slug] ?? [];
          return {
            ...article,
            backlinks: inboundBySlug[article.slug] ?? 0,
            referencesCount: referencesCountBySlug[article.slug] ?? 0,
            revisionCount: history.length,
            firstEdited: history[history.length - 1]?.date ?? null,
            lastEdited: history[0]?.date ?? null,
            wordCount: wordCountBySlug[article.slug] ?? 0,
            sectionCount: sectionCountBySlug[article.slug] ?? 0,
            readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[article.slug] ?? 0) / 200)),
          };
        }),
      },
    }));
}

// Machine-readable per-category membership list. Exposes the existing category
// hub article set as structured JSON using the same build artifacts that power
// the category feed and article metadata surfaces, while keeping the route
// strictly non-visual.
export const GET: APIRoute = async ({ props, site }) => {
  const { categoryName, categoryPath, articles } = props as {
    categoryName: string;
    categoryPath: string;
    articles: Array<{ slug: string; title: string; summary: string; backlinks: number; referencesCount: number; revisionCount: number; firstEdited: string | null; lastEdited: string | null; wordCount: number; sectionCount: number; readingMinutes: number }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildCategoryArticlesDocument({ origin, categoryName, categoryPath, articles }),
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
