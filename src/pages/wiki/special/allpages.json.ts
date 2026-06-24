import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { getArticleReferences } from '../../../lib/article-references.js';
import { getArticleToc } from '../../../lib/article-toc.js';
import { buildAllPages } from '../../../../scripts/allpages.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

// Machine-readable article directory at /wiki/special/allpages.json. Mirrors
// the HTML Special:AllPages page as structured JSON for programmatic
// consumers (dashboards, search indexes, link rotators). The computation
// lives in scripts/allpages.js (pure function) and reuses the exact same
// `sortPagesByTitle` helper (src/lib/title-sort.js) the HTML page imports,
// so the JSON and HTML surfaces never disagree on which articles are
// listed, what their order is, or what the per-row fields are.

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

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  // The article body's word count — the same figure info.json exposes and the
  // article-page footer (mw-article-meta data-word-count) renders, computed from
  // the raw markdown body so a directory consumer can sort or filter the
  // directory by article length without an N-fetch sweep.
  const wordCountBySlug: Record<string, number> = {};
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json / history.json expose on
  // their envelopes, derived from the shared getArticleToc helper so a directory
  // consumer can sort or filter by article depth without an N-fetch sweep.
  const sectionCountBySlug: Record<string, number> = {};
  for (const page of pages) {
    const slug = getPageSlug(page);
    titleBySlug[slug] = page.data.title;
    wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
    const { headings } = await render(page);
    sectionCountBySlug[slug] = getArticleToc(headings).length;
  }

  const articles = buildAllPages({ pages, getPageSlug, origin });

  const body = JSON.stringify(
    {
      site: origin,
      allpagesJsonUrl: `${origin}/wiki/special/allpages.json`,
      count: articles.length,
      articles: articles.map((article) => {
        const history = historyForSlug(article.slug);
        const inboundLinks = publishedInboundLinkCount(backlinksData, article.slug, titleBySlug);
        return {
          slug: article.slug,
          title: article.title,
          summary: article.summary || null,
          url: article.url,
          infoUrl: `${origin}/wiki/${article.slug}/info/`,
          infoJsonUrl: `${origin}/wiki/${article.slug}/info.json`,
          backlinksUrl: `${origin}/wiki/${article.slug}/backlinks/`,
          backlinksJsonUrl: `${origin}/wiki/${article.slug}/backlinks.json`,
          historyUrl: `${origin}/wiki/${article.slug}/history/`,
          historyJsonUrl: `${origin}/wiki/${article.slug}/history.json`,
          citeUrl: `${origin}/wiki/${article.slug}/cite/`,
          citeJsonUrl: `${origin}/wiki/${article.slug}/cite.json`,
          bibtexUrl: `${origin}/wiki/${article.slug}/cite.bib`,
          referencesUrl: `${origin}/wiki/${article.slug}/references.json`,
          relatedUrl: `${origin}/wiki/${article.slug}/related.json`,
          tocJsonUrl: `${origin}/wiki/${article.slug}/toc.json`,
          imageUrl: `${origin}/og/${article.slug}.png`,
          categories: article.categories,
          backlinks: inboundLinks,
          // info.json names this figure incomingLinks; keep backlinks for the
          // field name the HTML listing endpoints (subnets/mostlinked) expose.
          incomingLinks: inboundLinks,
          // The article's revision stats from its commit history (newest-first) —
          // the same revisionCount / firstEdited / lastEdited trio info.json and
          // history.json expose per article, and mostlinkedpages.json / subnets.json
          // expose per directory entry — so a directory consumer can sort or filter
          // by age or recency without an N-fetch sweep of every article's history.
          revisionCount: history.length,
          firstEdited: history[history.length - 1]?.date ?? null,
          lastEdited: history[0]?.date ?? null,
          // The article's published outbound-reference count — the same figure
          // history.json and references.json expose (via getArticleReferences).
          referencesCount: getArticleReferences({ slug: article.slug, linkGraph: linkgraphData, titleBySlug }).length,
          // The article body's word count — the same figure info.json exposes —
          // so the directory can be sorted or filtered by article length.
          wordCount: wordCountBySlug[article.slug] ?? 0,
          // The article's estimated reading time in minutes — the same ~200 wpm
          // ceil estimate info.json exposes and the article-page footer renders
          // from wordCount — so the directory can be sorted or filtered by it.
          readingMinutes: Math.max(1, Math.ceil((wordCountBySlug[article.slug] ?? 0) / 200)),
          // The article's table-of-contents section count — the same figure
          // toc.json exposes as `count` and info.json exposes on its envelope.
          sectionCount: sectionCountBySlug[article.slug] ?? 0,
        };
      }),
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
