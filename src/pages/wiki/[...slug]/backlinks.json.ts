import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';
import { buildArticleBacklinks } from '../../../../scripts/article-backlinks.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and compareTitles sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug } = props as { page: { data: { title: string; categories?: string[] } }; slug: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const p of pages) titleBySlug[getPageSlug(p)] = p.data.title;

  const backlinks = (backlinksData[slug] ?? [])
    .filter((entry) => titleBySlug[entry.from])
    .map((entry) => ({ slug: entry.from, title: titleBySlug[entry.from] }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

  const body = JSON.stringify(
    buildArticleBacklinks({ slug, title: page.data.title, origin, categories: page.data.categories ?? [], backlinks }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
