import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleRelatedPages, getRelatedPages } from '../../../lib/related-pages';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

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

  return pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      params: { slug },
      props: {
        slug,
        title: page.data.title,
        summary: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
        relatedPages: getRelatedPages({
          slug,
          slugMap,
          categoriesIndex,
          backlinks: backlinksData,
          outgoing: linkgraphData,
          publishedSlugs,
          titleBySlug,
        }).map((entry) => ({
          ...entry,
          categories: slugMap[entry.slug]?.categories ?? [],
          backlinks: publishedInboundLinkCount(backlinksData, entry.slug, titleBySlug),
        })),
      },
    };
  });
}

// Machine-readable companion to the article-level "Related pages" block. It
// reuses the same build-time helper as /wiki/<slug>/ so the recommendation set,
// ordering, summaries, and topic tags stay aligned without introducing an HTML
// subpage or any visual diff.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, relatedPages } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    relatedPages: Array<{ slug: string; title: string; summary: string; tags: string[]; categories: string[]; backlinks: number }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(buildArticleRelatedPages({ slug, title, origin, summary, categories, incomingLinks, relatedPages }), null, 2);

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
