import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
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

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const articles = buildAllPages({ pages, getPageSlug, origin });

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
        backlinks: publishedInboundLinkCount(backlinksData, article.slug, titleBySlug),
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
