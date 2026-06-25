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
  // Per-slug frontmatter/body figures + revision history, each carried on the
  // envelope and every backlink entry. These maps are mutually independent and
  // depend only on each page itself, so build them in a single pass over the
  // collection instead of five separate Object.fromEntries traversals.
  const titleBySlug: Record<string, string> = {};
  const summaryBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  const wordCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    summaryBySlug[slug] = page.data.summary ?? '';
    categoriesBySlug[slug] = page.data.categories ?? [];
    wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
    historyBySlug[slug] = historyForSlug(slug);
  }
  // Per-slug table-of-contents section count — the same sectionCount info.json /
  // history.json expose (and the toc.json `count`). Built once from the content
  // collection so both this article's envelope and each backlink entry can carry
  // it without re-rendering inside GET. Kept as its own pass because rendering
  // each page is async.
  const sectionCountBySlug: Record<string, number> = Object.fromEntries(
    await Promise.all(pages.map(async (page) => [getPageSlug(page), getArticleToc((await render(page)).headings).length])),
  );
  // Published inbound-link count and outbound reference count — the same source
  // links to many articles, so computing them inside the entry map below would
  // recompute each source's stats once per article it backlinks to (O(articles ×
  // backlinks)), and getArticleReferences is a full link-graph join. Precompute
  // them once here, in a single pass; both depend on the complete titleBySlug
  // (the published-only join), so this runs after the map above is fully built.
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }

  return Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const history = historyBySlug[slug] ?? [];
      const backlinks = (backlinksData[slug] ?? [])
        .filter((entry) => titleBySlug[entry.from])
        .map((entry) => {
          const entryHistory = historyBySlug[entry.from] ?? [];
          return {
            slug: entry.from,
            title: titleBySlug[entry.from],
            summary: summaryBySlug[entry.from] ?? '',
            categories: categoriesBySlug[entry.from] ?? [],
            backlinks: inboundBySlug[entry.from] ?? 0,
            referencesCount: referencesCountBySlug[entry.from] ?? 0,
            sectionCount: sectionCountBySlug[entry.from] ?? 0,
            wordCount: wordCountBySlug[entry.from] ?? 0,
            revisionCount: entryHistory.length,
            firstEdited: entryHistory[entryHistory.length - 1]?.date ?? null,
            lastEdited: entryHistory[0]?.date ?? null,
          };
        })
        .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

      return {
        params: { slug },
        props: {
          page,
          slug,
          incomingLinks: inboundBySlug[slug] ?? 0,
          referencesCount: referencesCountBySlug[slug] ?? 0,
          sectionCount: sectionCountBySlug[slug] ?? 0,
          wordCount: wordCountBySlug[slug] ?? 0,
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
          backlinks,
        },
      };
    }),
  );
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and compareTitles sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks, referencesCount, sectionCount, wordCount, revisionCount, firstEdited, lastEdited, backlinks } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
    wordCount: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    backlinks: Array<{
      slug: string;
      title: string;
      summary: string;
      categories: string[];
      backlinks: number;
      referencesCount: number;
      sectionCount: number;
      wordCount: number;
      revisionCount: number;
      firstEdited: string | null;
      lastEdited: string | null;
    }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

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
