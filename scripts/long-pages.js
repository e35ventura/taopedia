// Build the "Long pages" report served at /wiki/special/longpages.json — the
// MediaWiki Special:LongPages maintenance report: every published article
// ranked by body word count descending so editors can spot oversized entries.
// Kept as a pure function in scripts/ (like short-pages.js / lonely-pages.js)
// so the endpoint and the regression check share one source of truth.
//
// Uses the same wordCount figure info.json / allpages.json expose and the
// shared compareTitles + plain slug tiebreak for deterministic same-length ties.

import { compareTitles } from '../src/lib/title-sort.js';

export function buildLongPages({ titleBySlug, wordCountBySlug }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      wordCount: wordCountBySlug[slug] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.wordCount - a.wordCount ||
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
