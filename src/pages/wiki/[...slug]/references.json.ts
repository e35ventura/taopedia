import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildArticleReferences, getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));
  const summaryBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.summary ?? '']));
  const categoriesBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.categories ?? []]));
  // Per-slug table-of-contents section count — the same sectionCount info.json /
  // history.json expose (and the toc.json `count`). Built once from the content
  // collection so both the envelope and each reference entry can carry it.
  const sectionCountBySlug = Object.fromEntries(
    await Promise.all(pages.map(async (page) => [getPageSlug(page), getArticleToc((await render(page)).headings).length])),
  );
  // Per-slug body word count — the same wordCount info.json / history.json expose
  // and allpages.json / subnets.json expose per directory entry.
  const wordCountBySlug = Object.fromEntries(
    pages.map((page) => [getPageSlug(page), (page.body ?? '').trim().split(/\s+/).filter(Boolean).length]),
  );

  return Promise.all(pages.map(async (page) => {
    const slug = getPageSlug(page);
    const references = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).map((ref) => {
      const history = historyForSlug(ref.slug);
      return {
        ...ref,
        summary: summaryBySlug[ref.slug] ?? '',
        categories: categoriesBySlug[ref.slug] ?? [],
        backlinks: publishedInboundLinkCount(backlinksData, ref.slug, titleBySlug),
        referencesCount: getArticleReferences({ slug: ref.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[ref.slug] ?? 0,
        wordCount: wordCountBySlug[ref.slug] ?? 0,
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      };
    });
    // History is newest-first, so [0] is the latest revision and the last entry
    // is the original publication — the same firstEdited/lastEdited pair the
    // info.json and history.json envelopes expose.
    const history = historyForSlug(slug);
    return {
      params: { slug },
      props: {
        slug,
        title: page.data.title,
        summary: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        sectionCount: sectionCountBySlug[slug] ?? 0,
        // The article body's word count — the same figure info.json / history.json
        // expose and the article-page footer (mw-article-meta data-word-count) renders.
        wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
        references,
      },
    };
  }));
}

// Machine-readable per-article outbound-reference index. Exposes the published
// article targets referenced by /wiki/<slug>/ using the same build-time link
// graph that powers backlinks.json, without advertising an HTML subpage that
// does not exist.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, sectionCount, wordCount, references } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    sectionCount: number;
    wordCount: number;
    references: Array<{
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
    buildArticleReferences({ slug, title, origin, summary, categories, incomingLinks, revisionCount, firstEdited, lastEdited, sectionCount, wordCount, references }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
