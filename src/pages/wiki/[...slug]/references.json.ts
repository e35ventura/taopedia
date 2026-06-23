import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleReferences, getArticleReferences } from '../../../lib/article-references.js';

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));
  const summaryBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.summary ?? '']));

  return pages.map((page) => {
    const slug = getPageSlug(page);
    const references = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).map((ref) => ({
      ...ref,
      summary: summaryBySlug[ref.slug] ?? '',
    }));
    return {
      params: { slug },
      props: {
        slug,
        title: page.data.title,
        categories: page.data.categories ?? [],
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
  const { slug, title, categories, references } = props as {
    slug: string;
    title: string;
    categories: string[];
    references: Array<{ slug: string; title: string; summary: string }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(buildArticleReferences({ slug, title, origin, categories, references }), null, 2);

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
