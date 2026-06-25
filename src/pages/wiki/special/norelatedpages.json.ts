import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildNoRelatedPages } from '../../../../scripts/no-related-pages.js';

const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string; categories?: string[]; summary?: string }> }
>;
const categoriesModules = import.meta.glob('../../../../public/data/categories.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
>;

const slugMap = Object.values(slugmapModules)[0]?.default ?? {};
const categoriesIndex = Object.values(categoriesModules)[0]?.default ?? {};
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

// Machine-readable no-related-pages list at /wiki/special/norelatedpages.json.
// Lists every published article for which getRelatedPages returns an empty list
// — the complement of per-article related.json (which lists suggested reading
// for one slug). Programmatic consumers include maintenance dashboards that need
// to find articles with no topic siblings or backlink-only relations surfaced
// as related reading without scraping HTML.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));
  const publishedSlugs = new Set(Object.keys(titleBySlug));

  const noRelated = buildNoRelatedPages({
    slugMap,
    categoriesIndex,
    backlinks: backlinksData,
    outgoing: linkgraphData,
    titleBySlug,
    publishedSlugs,
  });

  const body = JSON.stringify(
    {
      site: origin,
      norelatedpagesJsonUrl: `${origin}/wiki/special/norelatedpages.json`,
      count: noRelated.length,
      pages: noRelated.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        url: `${origin}/wiki/${entry.slug}/`,
        relatedUrl: `${origin}/wiki/${entry.slug}/related.json`,
        relatedJsonUrl: `${origin}/wiki/${entry.slug}/related.json`,
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
