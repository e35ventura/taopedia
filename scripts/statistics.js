// Build the machine-readable site statistics served at
// /wiki/special/statistics.json. Kept as a pure function in scripts/ (like
// opml.js, rss-feed.js, atom-feed.js) so the Astro endpoint and the regression
// check share one source of truth without rendering the site.
//
// The HTML Special:Statistics page (src/pages/wiki/special/statistics.astro)
// computes the same figures inline for human display; this builder exposes them
// as structured JSON for programmatic consumers (dashboards, monitoring,
// cross-referencing tools). The topic tiebreak uses the SAME compareTitles
// helper as the HTML page (not raw string comparison) so the two surfaces never
// disagree on numeric-suffixed topic names like "Subnet 9" vs "Subnet 10".

import { compareTitles } from '../src/lib/title-sort.js';

export function buildStatistics({ pages, historyForSlug, getPageSlug, categoriesIndex } = {}) {
  let totalWords = 0;
  let totalRevisions = 0;
  let newestDate = '';
  let oldestDate = '';
  const topicCounts = new Map();

  if (categoriesIndex) {
    for (const [name, slugs] of Object.entries(categoriesIndex)) {
      // Count DISTINCT article slugs per topic: an article that lists the same
      // category twice in its frontmatter is one tagged article, and
      // getCategoryArticles (behind the rendered category page) dedupes the same
      // way, so totalTopics/largestTopic must not double-report it.
      const count = Array.isArray(slugs) ? new Set(slugs).size : 0;
      if (count > 0) topicCounts.set(name, count);
    }
  }

  for (const page of pages ?? []) {
    const body = String(page?.body ?? '').trim();
    if (body) {
      totalWords += body.split(/\s+/).filter(Boolean).length;
    }
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    totalRevisions += Array.isArray(history) ? history.length : 0;
    for (const entry of Array.isArray(history) ? history : []) {
      const date = entry?.date ?? '';
      if (!date) continue;
      if (!newestDate || date > newestDate) newestDate = date;
      if (!oldestDate || date < oldestDate) oldestDate = date;
    }
    if (!categoriesIndex) {
      // Dedupe a page's own categories so a frontmatter list that repeats a
      // topic counts the article once (see the categoriesIndex branch above).
      for (const topic of new Set(page?.data?.categories ?? [])) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
  }

  const totalArticles = pages.length;
  const totalTopics = topicCounts.size;
  const averageWords = totalArticles ? Math.round(totalWords / totalArticles) : 0;
  const averageRevisions = totalArticles ? Math.round(totalRevisions / totalArticles) : 0;

  // Deterministic ordering: by count descending, then by name ascending using
  // compareTitles (pins 'en' locale with numeric: true) — the SAME comparator
  // the HTML Special:Statistics page uses, so the JSON and HTML outputs never
  // disagree on the topic order or the largestTopic selection.
  const sortedTopics = [...topicCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return compareTitles(a[0], b[0]);
  });

  return {
    totalArticles,
    totalTopics,
    totalRevisions,
    totalWords,
    averageWords,
    averageRevisions,
    newestDate,
    oldestDate,
    largestTopic: sortedTopics[0]
      ? { name: sortedTopics[0][0], count: sortedTopics[0][1] }
      : null,
    topics: sortedTopics.map(([name, count]) => ({ name, count })),
  };
}
