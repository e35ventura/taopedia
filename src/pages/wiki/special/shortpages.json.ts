import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';

// Machine-readable short-pages list at /wiki/special/shortpages.json. Lists all
// published articles ranked by body word count, shortest first. Surfaces stub
// articles — the best candidates for expansion. This complements
// Special:MostLinkedPages (inbound-link ranking) and Special:Statistics
// (aggregate counts): ShortPages ranks by content depth, so programmatic
// consumers can discover which entries have the least coverage. Word count
// splits on whitespace, matching the per-article metadata line and
// Special:Statistics. Ties break by title then slug with compareTitles so
// "Subnet 9" sorts before "Subnet 10" within a same-word-count bucket.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const shortPages = pages
    .map((page) => ({
      slug: getPageSlug(page),
      title: page.data.title,
      words: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
    }))
    .sort(
      (a, b) =>
        a.words - b.words ||
        compareTitles(a.title, b.title) ||
        compareTitles(a.slug, b.slug),
    );

  const body = JSON.stringify(
    {
      site: origin,
      count: shortPages.length,
      pages: shortPages.map((p) => ({
        slug: p.slug,
        title: p.title,
        url: `${origin}/wiki/${encodeURIComponent(p.slug)}/`,
        words: p.words,
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
