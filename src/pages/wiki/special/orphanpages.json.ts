import type { APIRoute } from 'astro';
import { buildOrphanPages } from '../../../../scripts/orphan-pages.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string }> }
>;

const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, meta]) => [slug, meta?.title ?? slug]),
);

// Machine-readable orphan-article list at /wiki/special/orphanpages.json.
// Lists every published article with zero inbound links from other published
// articles — the complement of Special:MostLinkedPages.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const orphans = buildOrphanPages({ backlinks: backlinksData, titleBySlug });

  const body = JSON.stringify(
    {
      site: origin,
      orphanpagesJsonUrl: `${origin}/wiki/special/orphanpages.json`,
      count: orphans.length,
      pages: orphans.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        url: `${origin}/wiki/${entry.slug}/`,
        backlinksUrl: `${origin}/wiki/${entry.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${entry.slug}/backlinks.json`,
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
