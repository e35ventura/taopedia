import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';
import { buildArticleBacklinks } from '../../../../scripts/article-backlinks.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';
import { getArticleReferences } from '../../../lib/article-references.js';

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

  return pages.map((page) => {
    const slug = getPageSlug(page);
    // History is newest-first, so [0] is the latest revision and the last entry
    // is the original publication — the same firstEdited/lastEdited pair info.json
    // and history.json expose.
    const history = historyForSlug(slug);
    return {
      params: { slug },
      props: {
        page,
        slug,
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      },
    };
  });
}

// Machine-readable companion to /wiki/<slug>/backlinks/. Uses the same
// published-only join and compareTitles sort as backlinks.astro so the two
// surfaces never drift.
export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug, incomingLinks, revisionCount, firstEdited, lastEdited } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  const summaryBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  for (const p of pages) {
    const pSlug = getPageSlug(p);
    titleBySlug[pSlug] = p.data.title;
    summaryBySlug[pSlug] = p.data.summary ?? '';
    categoriesBySlug[pSlug] = p.data.categories ?? [];
  }

  // The article's published OUTBOUND reference count — the complement of
  // incomingLinks — using the same getArticleReferences helper (published-only
  // join) that info.json / history.json / cite.json / related.json use.
  const referencesCount = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

  const backlinks = (backlinksData[slug] ?? [])
    .filter((entry) => titleBySlug[entry.from])
    .map((entry) => ({
      slug: entry.from,
      title: titleBySlug[entry.from],
      summary: summaryBySlug[entry.from] ?? '',
      categories: categoriesBySlug[entry.from] ?? [],
      backlinks: publishedInboundLinkCount(backlinksData, entry.from, titleBySlug),
      lastEdited: historyForSlug(entry.from)[0]?.date ?? null,
    }))
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
