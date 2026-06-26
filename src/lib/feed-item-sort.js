import { compareTitles } from './title-sort.js';
import { slugFromWikiHref } from './wiki-article-path.js';

// Canonical article URLs are always /wiki/<slug>/ (trailing slash). Extract the
// full route slug (including nested multi-segment paths) for feed tiebreaks when
// the caller did not supply an explicit sortKey.

/**
 * Deterministic same-timestamp tiebreak key for syndication feed items.
 *
 * Recent-changes feeds pass sortKey = article slug so equal-timestamp items match
 * Special:RecentChanges. Site-wide RSS/Atom/JSON feeds historically fell back to
 * the full canonical URL, which inverts prefix slugs: compareTitles on
 * `…/wiki/alpha/` vs `…/wiki/alpha_beta/` puts alpha_beta first because the "/"
 * boundary after the shared prefix collates before "_" in the longer slug.
 *
 * Prefer explicit sortKey, else extract the wiki slug from the URL, else fall
 * back to the raw URL string for non-article items.
 */
export function feedItemSortKey(item) {
  if (item?.sortKey != null && String(item.sortKey).trim() !== '') {
    return String(item.sortKey);
  }
  const url = String(item?.url ?? '');
  const slug = slugFromWikiHref(url);
  if (slug) return slug;
  return url;
}

/** Newest-first date ordering, then compareTitles on feedItemSortKey. */
export function compareFeedItemsByDateAndKey(a, b, itemDate) {
  const aDate = itemDate(a);
  const bDate = itemDate(b);
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return compareTitles(feedItemSortKey(a), feedItemSortKey(b));
}
