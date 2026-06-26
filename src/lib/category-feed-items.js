import { uniqueFeedCategories } from './feed-categories.js';
import { wikiArticleHref } from './wiki-article-path.js';

// Item mappers for the per-category JSON Feed, Atom, and RSS endpoints. Article
// URLs are built through wikiArticleHref and categories through uniqueFeedCategories
// — the same helpers site-feed-context (#1700) and recent-changes-feed (#1681) use —
// so category syndication does not inline fragile `${origin}/wiki/${slug}/` templates
// that corrupt nested slugs or slugs with a leading slash.

export function mapCategoryFeedJsonAtomItems(origin, items = []) {
  return items.map((item) => ({
    title: item.title,
    url: wikiArticleHref(origin, item.slug),
    image: `${origin}/og/${item.slug}.png`,
    description: item.summary,
    categories: uniqueFeedCategories(item.categories),
    datePublished: item.datePublished,
    dateModified: item.dateModified,
  }));
}

export function mapCategoryFeedRssItems(origin, items = []) {
  return items.map((item) => ({
    title: item.title,
    url: wikiArticleHref(origin, item.slug),
    image: `${origin}/og/${item.slug}.png`,
    description: item.summary,
    categories: uniqueFeedCategories(item.categories),
    date: item.date,
  }));
}
