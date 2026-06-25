import { compareTitles } from './title-sort.js';

export function sortSearchEntries(entries = []) {
  // Same-title tiebreak on the slug, matching sortPagesByTitle / getCategoryArticles /
  // getArticleReferences: compareTitles on the title, then a PLAIN code-unit
  // comparison of the slug — NOT compareTitles on the slug, whose numeric
  // collation would order subnet_9 before subnet_10 while the HTML listings
  // (raw id order) put subnet_10 first.
  return [...entries].sort(
    (a, b) => compareTitles(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}
