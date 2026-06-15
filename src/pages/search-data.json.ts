import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { compareTitles } from '../lib/title-sort.js';

const getPageSlug = (page: { id: string }) =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

export const GET: APIRoute = async () => {
  const pages = await getCollection('pages');
  const searchEntries = pages
    .map((page) => ({
      title: page.data.title,
      summary: page.data.summary ?? '',
      url: `/wiki/${getPageSlug(page)}/`,
      categories: page.data.categories ?? [],
    }))
    // Order by title, then by the canonical URL (unique per article, 1:1 with
    // the slug) as a deterministic tiebreak so the output never depends on the
    // unspecified getCollection() iteration order. The tiebreak uses raw,
    // locale-independent string comparison — like collectRecentChanges in
    // article-history.ts and the RSS feed — so ordering can't vary with the
    // build machine's locale.
    .sort((a, b) => compareTitles(a.title, b.title) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

  return new Response(JSON.stringify(searchEntries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
