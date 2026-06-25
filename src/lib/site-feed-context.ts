import { historyForSlug, lastmodForSlug } from './article-history';
import slugMap from '../../public/data/slugmap.json';

export {
  pageFromSlug,
  pagesFromSlugMap,
  publishedCategoriesBySlug,
  publishedSummaryBySlug,
  publishedTitleBySlug,
  sortedPagesFromSlugMap,
} from './article-metadata';

// Shared item builders for the site-wide JSON Feed, Atom, and RSS endpoints.
// Read public/data/slugmap.json for title/summary/categories — the same artifact
// search-data.json (#1405) and sitemap.xml (#1416) use — instead of calling
// getCollection('pages') and re-reading every article's frontmatter.
// historyBySlug caches each article's revision history once for datePublished
// and dateModified (historyForSlug is a full revision-history lookup per slug).

export function buildSiteJsonAtomFeedItems(origin: string) {
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  return Object.entries(slugMap).map(([slug, entry]) => {
    const history = (historyBySlug[slug] ??= historyForSlug(slug));
    return {
      title: entry?.title ?? slug,
      url: `${origin}/wiki/${slug}/`,
      image: `${origin}/og/${slug}.png`,
      description: entry?.summary ?? '',
      categories: entry?.categories ?? [],
      datePublished: history[history.length - 1]?.date ?? '',
      dateModified: history[0]?.date ?? '',
    };
  });
}

export function buildSiteRssFeedItems(origin: string) {
  return Object.entries(slugMap).map(([slug, entry]) => ({
    title: entry?.title ?? slug,
    url: `${origin}/wiki/${slug}/`,
    image: `${origin}/og/${slug}.png`,
    description: entry?.summary ?? '',
    categories: entry?.categories ?? [],
    date: lastmodForSlug(slug),
  }));
}
