import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildCitations } from '../../../../scripts/citations.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const origin = 'https://taopedia.org';

  return pages.map((page) => {
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    const date = history[0]?.date ?? '';
    const url = `${origin}/wiki/${slug}/`;
    // Precomputed once per route in getStaticPaths — GET used to call
    // historyForSlug again to derive the last-revision date for buildCitations().
    const { bibtex } = buildCitations({ title: page.data.title, url, slug, date });

    return {
      params: { slug },
      props: { bibtex },
    };
  });
}

export const GET: APIRoute = async ({ props }) => {
  const { bibtex } = props as { bibtex: string };

  return new Response(`${bibtex}\n`, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
    },
  });
};
