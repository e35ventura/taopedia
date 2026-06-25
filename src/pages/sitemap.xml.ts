import type { APIRoute } from 'astro';
import { compareTitles } from '../lib/title-sort.js';
import { lastmodForSlug } from '../lib/article-history';
import slugMap from '../../public/data/slugmap.json';
import categoriesIndex from '../../public/data/categories.json';

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

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/slugmap.json and categories.json — the same build artifacts
  // search-data.json (#1405) and categories.json (#1403) already use — instead
  // of calling getCollection('pages') and re-scanning every article's frontmatter.
  const lastmodBySlug: Record<string, string> = {};
  for (const slug of Object.keys(slugMap)) {
    lastmodBySlug[slug] = lastmodForSlug(slug);
  }

  // Canonical, trailing-slash paths that each map 1:1 to a built page: the
  // homepage, the two special listing pages, every category hub route, and
  // every article route. Category hubs are derived with the same logic as
  // wiki/category/[category].astro so each <loc> matches a built page exactly.
  // Search (robots-disallowed, no unique content) and per-article history
  // routes stay omitted so every <loc> is a stable, canonical content URL.
  // Each article builds a 1200x630 Open Graph card at /og/<slug>.png that
  // visually represents the article; surface it to image search via the
  // image-sitemap namespace (only article URLs carry an image). The card URL is
  // stable per slug and lives on this origin.
  const articleEntries = Object.entries(slugMap)
    .map(([slug, entry]) => ({
      path: `/wiki/${slug}/`,
      lastmod: lastmodBySlug[slug] ?? '',
      image: { loc: `${origin}/og/${slug}.png`, title: entry?.title ?? slug },
    }))
    .sort((a, b) => compareTitles(a.path, b.path));

  // Same derivation as wiki/category/[category].astro getStaticPaths: each
  // category label routed at /wiki/category/<label_>/ with spaces mapped to
  // underscores. A hub's <lastmod> is the newest member lastmod — ISO-8601 UTC
  // strings order correctly under string comparison.
  const categoryEntries = Object.entries(categoriesIndex)
    .map(([category, slugs]) => {
      let lastmod = '';
      for (const slug of slugs) {
        const memberLastmod = lastmodBySlug[slug] ?? '';
        if (memberLastmod > lastmod) lastmod = memberLastmod;
      }
      return {
        path: `/wiki/category/${categorySlug(category)}/`,
        lastmod,
      };
    })
    .sort((a, b) => compareTitles(a.path, b.path));

  const entries = [
    { path: '/', lastmod: '' },
    { path: '/wiki/special/allpages/', lastmod: '' },
    { path: '/wiki/special/categories/', lastmod: '' },
    { path: '/wiki/special/mostlinkedpages/', lastmod: '' },
    { path: '/wiki/special/recentchanges/', lastmod: '' },
    { path: '/wiki/special/statistics/', lastmod: '' },
    { path: '/wiki/special/subnets/', lastmod: '' },
    ...categoryEntries,
    ...articleEntries,
  ];

  const urls = entries
    .map((entry) => {
      const loc = `    <loc>${escapeXml(origin + entry.path)}</loc>`;
      const lastmodTag = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
      const image = 'image' in entry ? entry.image : undefined;
      const imageTag = image
        ? `\n    <image:image>\n      <image:loc>${escapeXml(image.loc)}</image:loc>` +
          `\n      <image:title>${escapeXml(image.title)}</image:title>\n    </image:image>`
        : '';
      return `  <url>\n${loc}${lastmodTag}${imageTag}\n  </url>`;
    })
    .join('\n');

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
    ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    urls +
    '\n</urlset>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
