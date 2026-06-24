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
  const wordCountBySlug = Object.fromEntries(
    pages.map((page) => [getPageSlug(page), (page.body ?? '').trim().split(/\s+/).filter(Boolean).length]),
  );
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json / history.json expose on
  // their envelopes, derived from the shared getArticleToc helper, so a category
  // consumer can gauge each article's depth without a second fetch.
  const sectionCountBySlug = Object.fromEntries(
    await Promise.all(
      pages.map(async (page) => [getPageSlug(page), getArticleToc((await render(page)).headings).length]),
    ),
  );
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
          const history = historyForSlug(article.slug);
          return {
            ...article,
            backlinks: publishedInboundLinkCount(backlinksData, article.slug, titleBySlug),
            referencesCount: getArticleReferences({ slug: article.slug, linkGraph: linkgraphData, titleBySlug }).length,
            revisionCount: history.length,
            firstEdited: history[history.length - 1]?.date ?? null,
            lastEdited: history[0]?.date ?? null,
            wordCount: wordCountBySlug[article.slug] ?? 0,
            sectionCount: sectionCountBySlug[article.slug] ?? 0,
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
    articles: Array<{ slug: string; title: string; summary: string; backlinks: number; referencesCount: number; revisionCount: number; firstEdited: string | null; lastEdited: string | null; wordCount: number; sectionCount: number }>;
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
