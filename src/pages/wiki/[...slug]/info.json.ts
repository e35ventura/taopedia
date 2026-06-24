import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildArticleInfo } from '../../../../scripts/article-info.js';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';

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
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

// Machine-readable companion to /wiki/<slug>/info/. It mirrors the existing
// Page-information surface using the same build artifacts the HTML page reads:
// page frontmatter, public/history/<slug>.json, and public/data/backlinks.json.
// No new pipeline is introduced, and only data already exposed in the UI is
// serialized.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] }; body?: string };
    slug: string;
  };

  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const history = historyForSlug(slug);

  // Count only inbound links from published articles, using the same content
  // collection the HTML info page (info.astro) and Special:WhatLinksHere
  // (backlinks.astro) join against — not slugmap.json, a separately generated
  // artifact that can drift from the published set. This keeps info.json's
  // incomingLinks identical to the figure rendered on /wiki/<slug>/info/.
  const pages = await getCollection('pages');
  const publishedSlugs = new Set(pages.map((p) => getPageSlug(p)));
  const incomingLinks = (backlinksData[slug] ?? []).filter((entry) => publishedSlugs.has(entry.from)).length;

  // referencesCount: the article's published OUTBOUND reference count — the
  // complement of incomingLinks — using the same getArticleReferences helper
  // (published-only join) that references.json / cite.json / history.json use,
  // so the figure agrees across every endpoint that exposes it.
  const titleBySlug: Record<string, string> = {};
  for (const p of pages) titleBySlug[getPageSlug(p)] = p.data.title;
  const referencesCount = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  const { headings } = await render(page);
  const sectionCount = getArticleToc(headings).length;

  // wordCount: the article body's word count — the same figure the article-page
  // footer (mw-article-meta data-word-count) renders, computed identically
  // (whitespace-split of the raw body). Exposing it on the info hub lets a
  // consumer show length / estimate reading time without scraping the HTML.
  const wordCount = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;

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
      revisionCount: history.length,
      firstEdited: history[history.length - 1]?.date ?? null,
      lastEdited: history[0]?.date ?? null,
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
