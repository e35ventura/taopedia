import { compareTitles } from './title-sort.js';

// Canonical article URLs are always /wiki/<slug>/ (trailing slash). Extract the
// slug for feed tiebreaks when the caller did not supply an explicit sortKey.
const WIKI_SLUG_FROM_URL = /\/wiki\/([^/?#]+)/;

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
  const match = url.match(WIKI_SLUG_FROM_URL);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return url;
}

/** Newest-first date ordering, then compareTitles on feedItemSortKey. */
export function compareFeedItemsByDateAndKey(a, b, itemDate) {
  const aDate = itemDate(a);
  const bDate = itemDate(b);
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return compareTitles(feedItemSortKey(a), feedItemSortKey(b));
}
