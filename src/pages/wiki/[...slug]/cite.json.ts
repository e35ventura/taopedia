import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildCitations, CITATION_META } from '../../../../scripts/citations.js';
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

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug, incomingLinks, referencesCount, sectionCount } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
    referencesCount: number;
    sectionCount: number;
  };
  const url = new URL(`/wiki/${slug}/`, site ?? new URL('https://taopedia.org')).toString();
  const history = historyForSlug(slug);
  const date = history[0]?.date ?? '';
  const citations = buildCitations({ title: page.data.title, url, slug, date });

  const body = JSON.stringify(
    {
      title: page.data.title,
      slug,
      summary: page.data.summary || null,
      url,
      citeJsonUrl: new URL(`/wiki/${slug}/cite.json`, site ?? new URL('https://taopedia.org')).toString(),
      citeUrl: new URL(`/wiki/${slug}/cite/`, site ?? new URL('https://taopedia.org')).toString(),
      bibtexUrl: new URL(`/wiki/${slug}/cite.bib`, site ?? new URL('https://taopedia.org')).toString(),
      historyUrl: new URL(`/wiki/${slug}/history/`, site ?? new URL('https://taopedia.org')).toString(),
      historyJsonUrl: new URL(`/wiki/${slug}/history.json`, site ?? new URL('https://taopedia.org')).toString(),
      backlinksUrl: new URL(`/wiki/${slug}/backlinks/`, site ?? new URL('https://taopedia.org')).toString(),
      backlinksJsonUrl: new URL(`/wiki/${slug}/backlinks.json`, site ?? new URL('https://taopedia.org')).toString(),
      infoUrl: new URL(`/wiki/${slug}/info/`, site ?? new URL('https://taopedia.org')).toString(),
      infoJsonUrl: new URL(`/wiki/${slug}/info.json`, site ?? new URL('https://taopedia.org')).toString(),
      tocJsonUrl: new URL(`/wiki/${slug}/toc.json`, site ?? new URL('https://taopedia.org')).toString(),
      referencesUrl: new URL(`/wiki/${slug}/references.json`, site ?? new URL('https://taopedia.org')).toString(),
      relatedUrl: new URL(`/wiki/${slug}/related.json`, site ?? new URL('https://taopedia.org')).toString(),
      imageUrl: new URL(`/og/${slug}.png`, site ?? new URL('https://taopedia.org')).toString(),
      categories: page.data.categories ?? [],
      incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
      // The article's revision count — the same figure info.json and history.json
      // expose on their envelopes (the length of the article's commit history) —
      // so a consumer citing the article can record how many times it was revised
      // without a second fetch.
      revisionCount: history.length,
      // firstEdited / lastEdited bracket the article's revision history (oldest
      // and newest commit dates), the same pair info.json and history.json
      // expose on their envelopes — completing the history-stats set cite.json
      // already exposes revisionCount for. Use the same optional-chaining access
      // (`history[i]?.date ?? null`) every sibling endpoint uses (info.json,
      // references.json, related.json, backlinks.json): a history entry's `date`
      // is optional, and `history[i].date` would yield `undefined` for a dateless
      // entry — which JSON.stringify OMITS, dropping the key entirely and breaking
      // the string|null contract the siblings and the regression check rely on.
      firstEdited: history[history.length - 1]?.date ?? null,
      lastEdited: history[0]?.date ?? null,
      // referencesCount is the article's published outbound-reference count —
      // the same figure history.json and references.json expose (as `count`),
      // so a consumer citing the article can record how many wiki pages it links
      // to without a second fetch.
      referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
      // sectionCount is the article's table-of-contents section count — the
      // same figure toc.json exposes as `count` (via the shared getArticleToc
      // helper), so a consumer citing the article can see its outline size
      // without a second fetch.
      sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
      ...(date ? { date } : {}),
      ...CITATION_META,
      citations,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
