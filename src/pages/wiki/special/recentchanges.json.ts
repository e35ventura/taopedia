import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, allRecentChanges } from '../../../lib/article-history';
import { RECENT_LIMIT } from '../../../lib/recent-changes.js';

// Machine-readable site-wide recent changes at /wiki/special/recentchanges.json.
// Mirrors the HTML Special:RecentChanges feed as structured JSON for programmatic
// consumers (dashboards, change monitors, cross-referencing tools), alongside the
// statistics/categories/mostlinkedpages/allpages JSON endpoints. It reuses the
// exact allRecentChanges() builder (src/lib/article-history) and RECENT_LIMIT the
// HTML page consumes, so the JSON and HTML feeds never disagree.

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const titleBySlug: Record<string, string> = {};
  for (const page of pages) {
    titleBySlug[getPageSlug(page)] = page.data.title;
  }

  const changes = allRecentChanges(titleBySlug, RECENT_LIMIT);

  const body = JSON.stringify(
    {
      site: origin,
      recentchangesJsonUrl: `${origin}/wiki/special/recentchanges.json`,
      feedUrl: `${origin}/wiki/special/recentchanges/feed.json`,
      atomUrl: `${origin}/wiki/special/recentchanges/atom.xml`,
      rssUrl: `${origin}/wiki/special/recentchanges/rss.xml`,
      limit: RECENT_LIMIT,
      count: changes.length,
      changes: changes.map((change) => ({
        id: `urn:taopedia:recentchanges:${change.slug}:${change.sha}`,
        slug: change.slug,
        title: change.title,
        url: `${origin}/wiki/${change.slug}/`,
        infoUrl: `${origin}/wiki/${change.slug}/info/`,
        infoJsonUrl: `${origin}/wiki/${change.slug}/info.json`,
        backlinksUrl: `${origin}/wiki/${change.slug}/backlinks/`,
        backlinksJsonUrl: `${origin}/wiki/${change.slug}/backlinks.json`,
        historyUrl: `${origin}/wiki/${change.slug}/history/`,
        historyJsonUrl: `${origin}/wiki/${change.slug}/history.json`,
        citeUrl: `${origin}/wiki/${change.slug}/cite/`,
        citeJsonUrl: `${origin}/wiki/${change.slug}/cite.json`,
        bibtexUrl: `${origin}/wiki/${change.slug}/cite.bib`,
        referencesUrl: `${origin}/wiki/${change.slug}/references.json`,
        relatedUrl: `${origin}/wiki/${change.slug}/related.json`,
        tocJsonUrl: `${origin}/wiki/${change.slug}/toc.json`,
        imageUrl: `${origin}/og/${change.slug}.png`,
        date: change.date,
        authorName: change.authorName,
        sha: change.sha,
        message: change.message ?? '',
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
