import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildArticleInfo } from '../../../../scripts/article-info.js';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;

const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
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
          // Precomputed once per route in getStaticPaths — the same figures the
          // GET handler used to re-derive on every info.json build by calling
          // getCollection + render again. Matches history.json / cite.json.
          incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
          referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
          sectionCount: getArticleToc(headings).length,
          wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
        },
      };
    }),
  );
}

// Machine-readable companion to /wiki/<slug>/info/. It mirrors the existing
// Page-information surface using the same build artifacts the HTML page reads:
// page frontmatter, public/history/<slug>.json, and public/data/backlinks.json.
// No new pipeline is introduced, and only data already exposed in the UI is
// serialized.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks, referencesCount, sectionCount, wordCount, revisionCount, firstEdited, lastEdited } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
  };

  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleInfo({
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
