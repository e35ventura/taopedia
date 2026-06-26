import type { APIRoute } from 'astro';
import { render } from 'astro:content';
import { buildCategoryArticlesDocument, getCategoryArticles } from '../../../../lib/category-articles.js';
import { publishedTitleBySlug } from '../../../../lib/article-metadata';
import { contentPagesBySlug } from '../../../../lib/content-pages-by-slug';
import { gatherLinkStatsBySlug } from '../../../../lib/article-link-stats';
import { historyForSlug } from '../../../../lib/article-history';
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
const titleBySlug = publishedTitleBySlug();

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  // Only category-member slugs need render()/body stats — not every published
  // article — keyed from public/data/categories.json, the same artifact the
  // category hub pages read.
  const memberSlugs = new Set<string>();
  for (const slugs of Object.values(categoriesIndex)) {
    for (const slug of Array.isArray(slugs) ? slugs : []) memberSlugs.add(slug);
  }
  const pageBySlug = await contentPagesBySlug(memberSlugs);

  // Gather each member's body word count, table-of-contents section count, and
  // revision history in a single pass over the member slug set — these were
  // three separate loops over the full content collection. The wordCount and
  // history reads are folded into the render pass (rendering is what requires a
  // resolved page), kept parallel via Promise.all so the render step is not
  // serialized. sectionCount is the same figure toc.json exposes as `count`;
  // each is a per-entry stat the list carries.
  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  await Promise.all(
    [...memberSlugs].map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  // Published inbound-link count and outbound reference count, gathered in a single
  // pass over member slugs via the shared gatherLinkStatsBySlug helper. Precomputing
  // them per slug here keeps each article's stats out of the per-category article loop
  // below, which would otherwise recompute them once per category membership (an
  // article in N categories is visited N times).
  const { inboundBySlug, referencesCountBySlug } = gatherLinkStatsBySlug(memberSlugs, {
    titleBySlug,
    backlinksData,
    linkgraphData,
  });
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
