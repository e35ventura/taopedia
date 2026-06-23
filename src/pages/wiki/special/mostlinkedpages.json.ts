import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
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

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const ranked = buildMostLinkedPages({ backlinks: backlinksData, titleBySlug });

  const body = JSON.stringify(
    {
      site: origin,
      count: ranked.length,
      pages: ranked.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        url: `${origin}/wiki/${entry.slug}/`,
        infoUrl: `${origin}/wiki/${entry.slug}/info/`,
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
        backlinks: entry.count,
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
