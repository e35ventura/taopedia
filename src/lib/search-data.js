import { compareTitles } from './title-sort.js';

export function sortSearchEntries(entries = []) {
  // Same-title tiebreak on the slug, matching the slug-based tiebreak every
  // other article listing on the site uses (recent changes, references, related,
  // backlinks, most-linked, category articles). Comparing the full canonical URL
  // instead diverges when one slug is a prefix of another (e.g. "alpha" vs
  // "alpha_beta"): the "/" boundary after the shared prefix flips the collation
  // versus the "_" in the longer slug, so identical-title articles would order
  // differently in search results than everywhere else on the site.
  return [...entries].sort(
    (a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug),
  );
}
