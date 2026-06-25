import type { APIRoute } from 'astro';
import { buildBrokenLinks } from '../../../../scripts/broken-links.js';

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string; text?: string }>> }
>;
const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string }> }
>;

const linkGraph = Object.values(linkgraphModules)[0]?.default ?? {};
const slugMap = Object.values(slugmapModules)[0]?.default ?? {};

// Machine-readable missing-link report at /wiki/special/brokenlinks.json for
// programmatic consumers (dashboards, article-gap tooling). Uses the same
// linkgraph + slugmap artifacts article pages use for red-link detection.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const broken = buildBrokenLinks({ linkGraph, slugMap });

  const body = JSON.stringify(
    {
      site: origin,
      brokenlinksJsonUrl: `${origin}/wiki/special/brokenlinks.json`,
      count: broken.length,
      targets: broken.map((entry) => ({
        slug: entry.slug,
        count: entry.count,
        texts: entry.texts,
        from: entry.from.map((article) => ({
          slug: article.slug,
          title: article.title,
          url: `${origin}/wiki/${article.slug}/`,
        })),
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
