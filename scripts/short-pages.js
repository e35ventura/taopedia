// Build the "Short pages" (stub articles) report served at
// /wiki/special/shortpages.json — the MediaWiki Special:ShortPages maintenance
// report: published articles whose body word count is at or below a fixed stub
// threshold. Kept as a pure function in scripts/ (like lonely-pages.js /
// wanted-pages.js) so the endpoint and the regression check share one source
// of truth without rendering the site.
//
// MediaWiki ranks short pages by size ascending so editors can expand stubs;
// this uses the same wordCount figure info.json / allpages.json expose (body
// whitespace-split token count) and the shared compareTitles + plain slug
// tiebreak ordering the other special listings use.

import { compareTitles } from '../src/lib/title-sort.js';

/** Stub threshold in body words — articles at or below this count are "short". */
export const SHORT_PAGE_WORD_THRESHOLD = 500;

export function buildShortPages({ titleBySlug, wordCountBySlug, threshold = SHORT_PAGE_WORD_THRESHOLD }) {
  return Object.keys(titleBySlug ?? {})
    .map((slug) => ({
      slug,
      title: titleBySlug[slug],
      wordCount: wordCountBySlug[slug] ?? 0,
    }))
    .filter((entry) => entry.wordCount <= threshold)
    .sort(
      (a, b) =>
        a.wordCount - b.wordCount ||
        compareTitles(a.title, b.title) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}
