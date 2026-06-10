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
    .sort((a, b) => compareTitles(a.title, b.title));

  return new Response(JSON.stringify(searchEntries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
