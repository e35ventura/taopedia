import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, lastmodForSlug } from '../lib/article-history';

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
  // homepage, the two special listing pages, every category hub route, and
  // every article route. Category hubs are derived with the same logic as
  // wiki/category/[category].astro so each <loc> matches a built page exactly.
  // Search (robots-disallowed, no unique content) and per-article history
  // routes stay omitted so every <loc> is a stable, canonical content URL.
  // Each article builds a 1200x630 Open Graph card at /og/<slug>.png that
  // visually represents the article; surface it to image search via the
  // image-sitemap namespace (only article URLs carry an image). The card URL is
  // stable per slug and lives on this origin.
  const articleEntries = pages
    .map((page) => {
      const slug = getPageSlug(page);
      return {
        path: `/wiki/${slug}/`,
        lastmod: lastmodForSlug(slug),
        image: { loc: `${origin}/og/${slug}.png`, title: page.data.title },
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // Same derivation as wiki/category/[category].astro getStaticPaths: the set
  // of distinct category labels, each routed at /wiki/category/<label_>/ with
  // spaces mapped to underscores. These hub pages are indexable and carry their
  // own canonical + meta description (#58). A hub's listing changes exactly
  // when a member article changes, so its <lastmod> is the newest member
  // lastmod — the same history source as the article entries, whose ISO-8601
  // UTC strings order correctly under string comparison.
  const categoryNames = new Set<string>();
  const categoryLastmod = new Map<string, string>();
  for (const page of pages) {
    const lastmod = lastmodForSlug(getPageSlug(page));
    for (const category of page.data.categories ?? []) {
      categoryNames.add(category);
      if (lastmod && lastmod > (categoryLastmod.get(category) ?? '')) {
        categoryLastmod.set(category, lastmod);
      }
    }
  }
  const categoryEntries = [...categoryNames]
    .map((category) => ({
      path: `/wiki/category/${category.replace(/ /g, '_')}/`,
      lastmod: categoryLastmod.get(category) ?? '',
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

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
