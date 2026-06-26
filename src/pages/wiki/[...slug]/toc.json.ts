import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import {
  pageFromSlug,
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
} from '../../../lib/article-metadata';
import { getArticleReferences } from '../../../lib/article-references.js';
import { buildArticleToc, getArticleToc } from '../../../lib/article-toc.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import slugMap from '../../../../public/data/slugmap.json';

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
  const titleBySlug = publishedTitleBySlug();
  const summaryBySlug = publishedSummaryBySlug();
  const categoriesBySlug = publishedCategoriesBySlug();
  // Per-slug body word count, revision history, and table-of-contents sections —
  // the stats the envelope carries. These depend only on each page itself; the
  // wordCount and history reads are folded into the render pass (rendering each
  // page is async and is what requires a resolved page) so the collection is
  // traversed once for all per-page stats, kept parallel via Promise.all — the
  // same single combined pass backlinks.json (#1269), references.json (#1248),
  // info.json (#1287), and cite.json (#1289) use.
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const sectionsBySlug: Record<string, ReturnType<typeof getArticleToc>> = {};
  await Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionsBySlug[slug] = getArticleToc(headings);
    }),
  );
  // Published inbound-link count and outbound reference count — gathered in a
  // single pass after titleBySlug is built (both resolve targets through it).
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const slug of Object.keys(slugMap)) {
    if (!pageFromSlug(slug, slugMap)) continue;
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }

  return Object.keys(slugMap).flatMap((slug) => {
    const page = pageFromSlug(slug, slugMap);
    if (!page) return [];

    const history = historyBySlug[slug] ?? [];
    return {
      params: { slug },
      props: {
        slug,
        title: titleBySlug[slug] ?? page.data.title,
        summary: summaryBySlug[slug] ?? '',
        categories: categoriesBySlug[slug] ?? [],
        incomingLinks: inboundBySlug[slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        referencesCount: referencesCountBySlug[slug] ?? 0,
        wordCount: wordCountBySlug[slug] ?? 0,
        sections: sectionsBySlug[slug] ?? [],
      },
    };
  });
}

// Machine-readable companion to the rendered article contents sidebar. It uses
// the same shared TOC helper the article page consumes, so the visibility,
// numbering, and deep-link contract live in one runtime source of truth.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, referencesCount, wordCount, sections } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    referencesCount: number;
    wordCount: number;
    sections: Array<{ number: number; depth: number; slug: string; title: string }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleToc({ slug, title, origin, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, referencesCount, wordCount, sections }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
