import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildMostLinkedPages } from '../../../../scripts/most-linked.js';

// Machine-readable inbound-link ranking at /wiki/special/mostlinkedpages.json.
// Mirrors the HTML Special:MostLinkedPages page as structured JSON for
// programmatic consumers (dashboards, monitoring, cross-referencing tools). The
// ranking is shared through scripts/most-linked.js (pure function) so the
// endpoint and the regression check derive from one source of truth, and the
// backlink graph is the same public/data/backlinks.json the HTML page reads.
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, string[]> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  const categoriesBySlug: Record<string, string[]> = {};
  const summaryBySlug: Record<string, string> = {};
  const pageBySlug: Record<string, (typeof pages)[number]> = {};
  // The article body's word count — the same figure info.json exposes and the
  // article-page footer (mw-article-meta data-word-count) renders, computed from
  // the raw markdown body so a consumer of the ranking can gauge each top page's
  // article length without a second fetch.
  const wordCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    categoriesBySlug[slug] = page.data.categories ?? [];
    summaryBySlug[slug] = page.data.summary ?? '';
    pageBySlug[slug] = page;
    wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  }

  const ranked = buildMostLinkedPages({ backlinks: backlinksData, titleBySlug });

  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json / history.json expose on
  // their envelopes, derived from the shared getArticleToc helper. Rendered only
  // for the ranked pages so a consumer can gauge each top page's depth (how many
  // sections it has) alongside its link popularity without a second fetch.
  const sectionCountBySlug: Record<string, number> = {};
  for (const entry of ranked) {
    const page = pageBySlug[entry.slug];
    if (!page) continue;
    const { headings } = await render(page);
    sectionCountBySlug[entry.slug] = getArticleToc(headings).length;
  }

  const body = JSON.stringify(
    {
      site: origin,
      mostlinkedpagesJsonUrl: `${origin}/wiki/special/mostlinkedpages.json`,
      count: ranked.length,
      pages: ranked.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        summary: summaryBySlug[entry.slug] || null,
        url: `${origin}/wiki/${entry.slug}/`,
        infoUrl: `${origin}/wiki/${entry.slug}/info/`,
        infoJsonUrl: `${origin}/wiki/${entry.slug}/info.json`,
        historyUrl: `${origin}/wiki/${entry.slug}/history/`,
        historyJsonUrl: `${origin}/wiki/${entry.slug}/history.json`,
        backlinksUrl: `${origin}/wiki/${entry.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${entry.slug}/backlinks.json`,
        citeUrl: `${origin}/wiki/${entry.slug}/cite/`,
        citeJsonUrl: `${origin}/wiki/${entry.slug}/cite.json`,
        bibtexUrl: `${origin}/wiki/${entry.slug}/cite.bib`,
        referencesUrl: `${origin}/wiki/${entry.slug}/references.json`,
        relatedUrl: `${origin}/wiki/${entry.slug}/related.json`,
        tocJsonUrl: `${origin}/wiki/${entry.slug}/toc.json`,
        imageUrl: `${origin}/og/${entry.slug}.png`,
        categories: categoriesBySlug[entry.slug] ?? [],
        backlinks: entry.count,
        // info.json names this figure incomingLinks; keep backlinks for the field
        // name the HTML listing endpoints (allpages/subnets/category) expose. Same
        // dual-naming references.json / related.json / backlinks.json already
        // expose per entry.
        incomingLinks: entry.count,
        // referencesCount is the article's published OUTBOUND reference count —
        // the complement of backlinks (its inbound count) — using the same
        // getArticleReferences helper (published-only join) that references.json /
        // cite.json / info.json use, so a consumer of the ranking can see both
        // directions of each top page's link degree without a second fetch.
        referencesCount: getArticleReferences({ slug: entry.slug, linkGraph: linkgraphData, titleBySlug }).length,
        sectionCount: sectionCountBySlug[entry.slug] ?? 0,
        wordCount: wordCountBySlug[entry.slug] ?? 0,
        // The article's estimated reading time in minutes — the same ~200 wpm
        // ceil estimate info.json exposes and the article-page footer renders
        // from wordCount, so a consumer of the ranking can gauge each top page's
        // reading time without a second fetch.
        readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[entry.slug] ?? 0) / 200)),
        // The article's revision stats (history is newest-first) — the same
        // revisionCount / firstEdited / lastEdited trio info.json / history.json
        // expose per article and allpages.json exposes per directory entry — so a
        // consumer of the ranking can see each top page's age and recency without
        // a second fetch.
        revisionCount: historyForSlug(entry.slug).length,
        firstEdited: historyForSlug(entry.slug).at(-1)?.date ?? null,
        lastEdited: historyForSlug(entry.slug)[0]?.date ?? null,
      })),
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
