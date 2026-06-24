import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';
import { buildArticleBacklinks } from '../../../../scripts/article-backlinks.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
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
          sectionCount: getArticleToc(headings).length,
          // The article body's word count — the same figure info.json / history.json
          // expose and the article-page footer (mw-article-meta data-word-count) renders.
          wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
        },
      };
    }),
  );
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and compareTitles sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks, sectionCount, wordCount, revisionCount, firstEdited, lastEdited } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    sectionCount: number;
    wordCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  const summaryBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  const wordCountBySlug: Record<string, number> = {};
  for (const p of pages) {
    const pSlug = getPageSlug(p);
    titleBySlug[pSlug] = p.data.title;
    summaryBySlug[pSlug] = p.data.summary ?? '';
    categoriesBySlug[pSlug] = p.data.categories ?? [];
    wordCountBySlug[pSlug] = (p.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  }

  // The article's published OUTBOUND reference count — the complement of
  // incomingLinks — using the same getArticleReferences helper (published-only
  // join) that info.json / history.json / cite.json / related.json use.
  const referencesCount = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

  const backlinks = (backlinksData[slug] ?? [])
    .filter((entry) => titleBySlug[entry.from])
    .map((entry) => {
      const history = historyForSlug(entry.from);
      return {
        slug: entry.from,
        title: titleBySlug[entry.from],
        summary: summaryBySlug[entry.from] ?? '',
        categories: categoriesBySlug[entry.from] ?? [],
        backlinks: publishedInboundLinkCount(backlinksData, entry.from, titleBySlug),
        referencesCount: getArticleReferences({ slug: entry.from, linkGraph: linkgraphData, titleBySlug }).length,
        wordCount: wordCountBySlug[entry.from] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      };
    })
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

  const body = JSON.stringify(
    buildArticleBacklinks({
      slug,
      title: page.data.title,
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
      backlinks,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
