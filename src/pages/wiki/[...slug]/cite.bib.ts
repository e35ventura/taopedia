import type { APIRoute } from 'astro';
import { historyForSlug } from '../../../lib/article-history';
import { pageFromSlug, publishedTitleBySlug } from '../../../lib/article-metadata';
import { buildCitations } from '../../../../scripts/citations.js';
import slugMap from '../../../../public/data/slugmap.json';

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();
  const origin = 'https://taopedia.org';

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const title = titleBySlug[slug] ?? page.data.title;
    const history = historyForSlug(slug);
    const date = history[0]?.date ?? '';
    const url = `${origin}/wiki/${slug}/`;
    // Precomputed once per route in getStaticPaths — GET used to call
    // historyForSlug again to derive the last-revision date for buildCitations().
    // Enumerate published slugs from public/data/slugmap.json — the same artifact
    // cite.json and cite.astro read — instead of getCollection('pages').
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
