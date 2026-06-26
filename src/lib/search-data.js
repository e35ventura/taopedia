import { compareTitles } from './title-sort.js';

export function sortSearchEntries(entries = []) {
  // Same-title tiebreak must match the canonical site-wide order: compareTitles on
  // the title (numeric collation), then a PLAIN code-unit comparison of the slug —
  // the exact contract sortPagesByTitle (src/lib/title-sort.js) defines and that
  // getArticleReferences and getCategoryArticles follow. It must NOT use
  // compareTitles on the slug: its numeric collation orders two same-title members
  // "subnet_9" before "subnet_10", while the article listings (raw id order, e.g.
  // Special:AllPages / category pages / references) put "subnet_10" first — so a
  // numeric slug tiebreak would order identical-title articles differently in search
  // results than everywhere else on the site. A plain code-unit slug comparison also
  // stays build-machine-locale independent (unlike a full-URL compare, which diverges
  // for prefix-pair slugs like "alpha" vs "alpha_beta").
  return [...entries].sort(
    (a, b) => compareTitles(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}
