import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildAllPages } from '../../../../scripts/allpages.js';

// Machine-readable article directory at /wiki/special/allpages.json. Mirrors
// the HTML Special:AllPages page as structured JSON for programmatic
// consumers (dashboards, search indexes, link rotators). The computation
// lives in scripts/allpages.js (pure function) and reuses the exact same
// `sortPagesByTitle` helper (src/lib/title-sort.js) the HTML page imports,
// so the JSON and HTML surfaces never disagree on which articles are
// listed, what their order is, or what the per-row fields are.

// The inbound-link graph is the same public/data/backlinks.json the HTML
// "What links here" page and mostlinkedpages.json read, so the per-row inbound
// count below matches those surfaces exactly.
const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const articles = buildAllPages({ pages, getPageSlug, origin });

  // Count only inbound links from OTHER published articles, the same
  // orphan-skipping, published-only inbound count mostlinkedpages.json exposes
  // per entry and info.json exposes as incomingLinks. allpages lists every
  // article (including zero-inbound ones), so this is the only directory surface
  // carrying the metric for the full set.
  const publishedSlugs = new Set(articles.map((article) => article.slug));
  const inboundCount = (slug: string) =>
    (backlinksData[slug] ?? []).filter((link) => publishedSlugs.has(link?.from)).length;

  const body = JSON.stringify(
    {
      site: origin,
      allpagesJsonUrl: `${origin}/wiki/special/allpages.json`,
      count: articles.length,
      articles: articles.map((article) => ({
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
        backlinks: inboundCount(article.slug),
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
