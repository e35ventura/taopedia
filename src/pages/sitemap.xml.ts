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

// The build generates per-article revision history at public/history/<slug>.json
// (scripts/generate-history.js, ordered newest-first), so the newest commit date
// is each article's last-modified time. Reuse it for <lastmod>; the same glob is
// used by src/pages/wiki/[...slug]/history.astro.
const historyModules = import.meta.glob('../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: Array<{ date?: string }> } }
>;

const lastmodForSlug = (slug: string): string => {
  const mod = historyModules[`../../public/history/${slug}.json`];
  const date = mod?.default?.history?.[0]?.date;
  return typeof date === 'string' ? date : '';
};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  // Canonical, trailing-slash paths that each map 1:1 to a built page: the
  // homepage, the two special listing pages, and every article route (derived
  // with the same getPageSlug as the article/search routes). Category, search
  // and per-article history routes are intentionally omitted so every <loc>
  // stays a stable, canonical content URL.
  const articleEntries = pages
    .map((page) => {
      const slug = getPageSlug(page);
      return { path: `/wiki/${slug}/`, lastmod: lastmodForSlug(slug) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const entries = [
    { path: '/', lastmod: '' },
    { path: '/wiki/special/allpages/', lastmod: '' },
    { path: '/wiki/special/categories/', lastmod: '' },
    ...articleEntries,
  ];

  const urls = entries
    .map(({ path, lastmod }) => {
      const loc = `    <loc>${escapeXml(origin + path)}</loc>`;
      const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : '';
      return `  <url>\n${loc}${lastmodTag}\n  </url>`;
    })
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
