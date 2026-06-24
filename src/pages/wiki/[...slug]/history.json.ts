import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildArticleHistory } from '../../../../scripts/article-history-json.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

type RawRevision = { sha: string; date: string; authorName: string; message?: string };

const historyModules = import.meta.glob('../../../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: RawRevision[] } }
>;

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));

  return Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const { headings } = await render(page);
      return {
        params: { slug },
        props: {
          page,
          slug,
          incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
          referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
          sectionCount: getArticleToc(headings).length,
        },
      };
    }),
  );
}

// Machine-readable companion to /wiki/<slug>/history/. Exposes the full
// per-commit revision list (sha, date, authorName, message) that history.astro
// renders, plus computed summary fields (revisionCount, firstEdited, lastEdited,
// referencesCount) that info.json summarises or that references.json exposes as
// `count`, plus sectionCount (the toc.json `count` figure), but does not break
// out per-revision.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks, referencesCount, sectionCount } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const mod = historyModules[`../../../../public/history/${slug}.json`];
  const revisions: RawRevision[] = mod?.default?.history ?? [];

  const body = JSON.stringify(
    buildArticleHistory({
      slug,
      title: page.data.title,
      origin,
      summary: page.data.summary ?? '',
      categories: page.data.categories ?? [],
      incomingLinks,
      referencesCount,
      sectionCount,
      revisions,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
