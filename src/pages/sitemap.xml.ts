import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const getPageSlug = (page: { id: string }) =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  // Canonical, trailing-slash paths that each map 1:1 to a built page: the
  // homepage, the two special listing pages, and every article route (derived
  // with the same getPageSlug as the article/search routes). Category, search
  // and per-article history routes are intentionally omitted so every <loc>
  // stays a stable, canonical content URL.
  const articlePaths = pages.map((page) => `/wiki/${getPageSlug(page)}/`).sort();
  const paths = [
    '/',
    '/wiki/special/allpages/',
    '/wiki/special/categories/',
    ...articlePaths,
  ];

  const urls = paths
    .map((path) => `  <url>\n    <loc>${escapeXml(origin + path)}</loc>\n  </url>`)
    .join('\n');

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
