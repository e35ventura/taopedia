import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildCitations } from '../../../../scripts/citations.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug } = props as { page: { data: { title: string } }; slug: string };
  const url = new URL(`/wiki/${slug}/`, site ?? new URL('https://taopedia.org')).toString();
  const date = historyForSlug(slug)[0]?.date ?? '';
  const { bibtex } = buildCitations({ title: page.data.title, url, slug, date });

  return new Response(`${bibtex}\n`, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
    },
  });
};
