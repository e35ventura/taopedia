import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';
import { buildArticleBacklinks } from '../../../../scripts/article-backlinks.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));

  return pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      params: { slug },
      props: {
        page,
        slug,
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
      },
    };
  });
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and compareTitles sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  const summaryBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  for (const p of pages) {
    const pSlug = getPageSlug(p);
    titleBySlug[pSlug] = p.data.title;
    summaryBySlug[pSlug] = p.data.summary ?? '';
    categoriesBySlug[pSlug] = p.data.categories ?? [];
  }

  const backlinks = (backlinksData[slug] ?? [])
    .filter((entry) => titleBySlug[entry.from])
    .map((entry) => ({
      slug: entry.from,
      title: titleBySlug[entry.from],
      summary: summaryBySlug[entry.from] ?? '',
      categories: categoriesBySlug[entry.from] ?? [],
      backlinks: publishedInboundLinkCount(backlinksData, entry.from, titleBySlug),
    }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

  const body = JSON.stringify(
    buildArticleBacklinks({
      slug,
      title: page.data.title,
      origin,
      summary: page.data.summary ?? '',
      categories: page.data.categories ?? [],
      incomingLinks,
      backlinks,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
