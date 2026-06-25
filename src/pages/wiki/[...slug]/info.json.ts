import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { publishedTitleBySlug } from '../../../lib/site-feed-context';
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
  const titleBySlug = publishedTitleBySlug();
  // Per-slug body word count, revision history, and table-of-contents section
  // count — the stats the envelope carries. These depend only on each page itself;
  // the wordCount and history reads are folded into the render pass (rendering each
  // page is async and is what requires a resolved page) so the collection is
  // traversed once for all per-page stats, kept parallel via Promise.all — the
  // same single combined pass backlinks.json (#1269), references.json (#1248), and
  // related.json (#1239) use.
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const sectionCountBySlug: Record<string, number> = {};
  await Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  // Published inbound-link count and outbound reference count — gathered in a
  // single pass after titleBySlug is built (both resolve targets through it).
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }

  return pages.map((page) => {
    const slug = getPageSlug(page);
    const history = historyBySlug[slug] ?? [];
    return {
      params: { slug },
      props: {
        page,
        slug,
        // Precomputed once per route in getStaticPaths — the same figures the
        // GET handler used to re-derive on every info.json build by calling
        // getCollection + render again. Matches history.json / cite.json.
        incomingLinks: inboundBySlug[slug] ?? 0,
        referencesCount: referencesCountBySlug[slug] ?? 0,
        sectionCount: sectionCountBySlug[slug] ?? 0,
        wordCount: wordCountBySlug[slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      },
    };
  });
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
