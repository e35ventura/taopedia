import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildCiteJson } from '../../../../scripts/cite-json.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

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
      const history = historyForSlug(slug);
      const { headings } = await render(page);
      return {
        params: { slug },
        props: {
          page,
          slug,
          incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
          referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
          sectionCount: getArticleToc(headings).length,
          wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
          // Precomputed once per route in getStaticPaths — the same revision
          // stats GET used to re-derive via historyForSlug on every cite.json
          // build. Matches info.json (#1037) / backlinks.json (#1042).
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
          date: history[0]?.date ?? '',
        },
      };
    }),
  );
}

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug, incomingLinks, referencesCount, sectionCount, wordCount, revisionCount, firstEdited, lastEdited, date } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    date: string;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildCiteJson({
      title: page.data.title,
      slug,
      origin,
      summary: page.data.summary ?? '',
      categories: page.data.categories ?? [],
      incomingLinks,
      referencesCount,
      sectionCount,
      wordCount,
      revisionCount,
      firstEdited,
      lastEdited,
      date,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
