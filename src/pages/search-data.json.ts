import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { sortSearchEntries } from '../lib/search-data.js';

const getPageSlug = (page: { id: string }) =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const searchEntries = sortSearchEntries(
    pages.map((page) => {
      const slug = getPageSlug(page);
      return {
        slug,
        title: page.data.title,
        summary: page.data.summary ?? '',
        url: `${origin}/wiki/${slug}/`,
        categories: page.data.categories ?? [],
      };
    }),
  );

  return new Response(JSON.stringify(searchEntries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
