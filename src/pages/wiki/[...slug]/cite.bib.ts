import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { publishedTitleBySlug } from '../../../lib/article-metadata';
import { buildCitations } from '../../../../scripts/citations.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = publishedTitleBySlug();
  const origin = 'https://taopedia.org';

  return pages.map((page) => {
    const slug = getPageSlug(page);
    const title = titleBySlug[slug] ?? page.data.title;
    const history = historyForSlug(slug);
    const date = history[0]?.date ?? '';
    const url = `${origin}/wiki/${slug}/`;
    // Precomputed once per route in getStaticPaths — GET used to call
    // historyForSlug again to derive the last-revision date for buildCitations().
    // Title comes from public/data/slugmap.json — same artifact cite.json reads.
    const { bibtex } = buildCitations({ title, url, slug, date });

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
