import type { APIRoute } from 'astro';
import { sortSearchEntries } from '../lib/search-data.js';
import { wikiArticleHref } from '../lib/wiki-article-path.js';
import slugMap from '../../public/data/slugmap.json';

// Prebuilt article metadata for the client-side search fallback and typeahead.
// Served at /search-data.json; consumed by search.astro, SearchSuggest.astro, and
// the random-page fallback without a separate API round-trip per article.

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  // Read public/data/slugmap.json — the same title/summary/categories artifact
  // related.json and category articles.json already use — instead of calling
  // getCollection('pages') and re-reading every article's frontmatter. Matches
  // feeds.opml.ts (#1299) and categories.json (#1403).
  const searchEntries = sortSearchEntries(
    Object.entries(slugMap).map(([slug, entry]) => ({
      slug,
      title: entry?.title ?? slug,
      summary: entry?.summary ?? '',
      url: wikiArticleHref(origin, slug),
      categories: [...new Set(entry?.categories ?? [])],
    })),
  );

  return new Response(JSON.stringify(searchEntries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
