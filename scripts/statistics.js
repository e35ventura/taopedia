// Build the machine-readable site statistics served at
// /wiki/special/statistics.json. Kept as a pure function in scripts/ (like
// opml.js, rss-feed.js, atom-feed.js) so the Astro endpoint and the regression
// check share one source of truth without rendering the site.
//
// The HTML Special:Statistics page (src/pages/wiki/special/statistics.astro)
// computes the same figures inline for human display; this builder exposes them
// as structured JSON for programmatic consumers (dashboards, monitoring,
// cross-referencing tools). The computation is deterministic: topic ordering
// uses raw string comparison (NOT localeCompare) so the JSON output is
// byte-stable across build machines.

export function buildStatistics({ pages, historyForSlug, getPageSlug }) {
  let totalWords = 0;
  let totalRevisions = 0;
  let newestDate = '';
  const topicCounts = new Map();

  for (const page of pages) {
    const body = String(page?.body ?? '').trim();
    if (body) {
      totalWords += body.split(/\s+/).filter(Boolean).length;
    }
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    totalRevisions += Array.isArray(history) ? history.length : 0;
    const latest = history?.[0]?.date ?? '';
    if (latest && latest > newestDate) newestDate = latest;
    for (const topic of page?.data?.categories ?? []) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  const totalArticles = pages.length;
  const totalTopics = topicCounts.size;
  const averageWords = totalArticles ? Math.round(totalWords / totalArticles) : 0;

  // Deterministic ordering: by count descending, then by name ascending using
  // raw string comparison (NOT localeCompare — per the repo determinism rule,
  // built output must not depend on the build machine's locale).
  const sortedTopics = [...topicCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  return {
    totalArticles,
    totalTopics,
    totalRevisions,
    totalWords,
    averageWords,
    newestDate,
    largestTopic: sortedTopics[0]
      ? { name: sortedTopics[0][0], count: sortedTopics[0][1] }
      : null,
    topics: sortedTopics.map(([name, count]) => ({ name, count })),
  };
}
