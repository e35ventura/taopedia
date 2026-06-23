import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleHistory } from '../../../../scripts/article-history-json.js';

type RawRevision = { sha: string; date: string; authorName: string; message?: string };

const historyModules = import.meta.glob('../../../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: RawRevision[] } }
>;

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

// Machine-readable companion to /wiki/<slug>/history/. Exposes the full
// per-commit revision list (sha, date, authorName, message) that history.astro
// renders, plus computed summary fields (revisionCount, firstEdited, lastEdited)
// that info.json summarises but does not break out per-revision.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug } = props as { page: { data: { title: string; summary?: string; categories?: string[] } }; slug: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const mod = historyModules[`../../../../public/history/${slug}.json`];
  const revisions: RawRevision[] = mod?.default?.history ?? [];

  const body = JSON.stringify(
    buildArticleHistory({ slug, title: page.data.title, origin, summary: page.data.summary ?? '', categories: page.data.categories ?? [], revisions }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
