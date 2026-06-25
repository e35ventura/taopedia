import type { APIRoute } from 'astro';
import { buildDeadEndPages } from '../../../../scripts/dead-end-pages.js';

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
>;
const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string }> }
>;

const linkGraph = Object.values(linkgraphModules)[0]?.default ?? {};
const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, meta]) => [slug, meta?.title ?? slug]),
);

// Machine-readable dead-end article list at /wiki/special/deadendpages.json.
// Lists every published article with zero outbound wiki references to other
// published articles — the complement of per-article references.json (which
// lists outbound links for one slug). Programmatic consumers include maintenance
// dashboards and link-graph tooling that need to find articles that do not link
// outward without scraping HTML.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const deadEnds = buildDeadEndPages({ linkGraph, titleBySlug });

  const body = JSON.stringify(
    {
      site: origin,
      deadendpagesJsonUrl: `${origin}/wiki/special/deadendpages.json`,
      count: deadEnds.length,
      pages: deadEnds.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        url: `${origin}/wiki/${entry.slug}/`,
        referencesUrl: `${origin}/wiki/${entry.slug}/references.json`,
        referencesJsonUrl: `${origin}/wiki/${entry.slug}/references.json`,
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
