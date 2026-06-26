import { compareTitles } from './title-sort.js';

export function sortSearchEntries(entries = []) {
  // Same-title tiebreak on raw slug code-unit order — the same rule references.json
  // (#1487), most-linked (#1546), and backlinks (#1588) use. compareTitles on the
  // slug would order subnet_9 before subnet_10 while the rest of the site puts
  // subnet_10 first; comparing the full canonical URL diverges when one slug is a
  // prefix of another (alpha vs alpha_beta).
  return [...entries].sort(
    (a, b) =>
      compareTitles(a.title, b.title) ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}
