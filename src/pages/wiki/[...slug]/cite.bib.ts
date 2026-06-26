import type { APIRoute } from 'astro';
import { historyForSlug } from '../../../lib/article-history';
import { pageFromSlug, publishedTitleBySlug } from '../../../lib/article-metadata';
import { wikiArticleHref } from '../../../lib/wiki-article-path.js';
import { buildCitations } from '../../../../scripts/citations.js';
import slugMap from '../../../../public/data/slugmap.json';

export async function getStaticPaths() {
  const titleBySlug = publishedTitleBySlug();

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const title = titleBySlug[slug] ?? page.data.title;
    const history = historyForSlug(slug);
    const date = history[0]?.date ?? '';
    // Precomputed once per route in getStaticPaths — GET used to call
    // historyForSlug again to derive the last-revision date for buildCitations().
    // Enumerate published slugs from public/data/slugmap.json — the same artifact
    // cite.json and cite.astro read — instead of getCollection('pages').

    return {
      params: { slug },
      props: { title, slug, date },
    };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
  const { title, slug, date } = props as { title: string; slug: string; date: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const url = wikiArticleHref(origin, slug);
  const { bibtex } = buildCitations({ title, url, slug, date });

  return new Response(`${bibtex}\n`, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
    },
  });
};
