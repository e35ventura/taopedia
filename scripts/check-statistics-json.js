import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatistics } from './statistics.js';

// /wiki/special/statistics.json exposes the site's content statistics as
// structured JSON for programmatic consumers. The contract is small but
// load-bearing: a malformed JSON response, a wrong count, a non-deterministic
// topic ordering, or a largestTopic that disagrees with the HTML page would
// silently break every downstream consumer. This check guards all of those:
//   1) Unit-tests buildStatistics with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the topic tiebreak uses compareTitles (NOT raw string) so the
//      JSON and HTML surfaces never disagree on numeric-suffixed names.
//   3) Parses the built dist/wiki/special/statistics.json and validates EVERY
//      field the endpoint emits, including largestTopic consistency with topics[0].

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildStatistics with constructed inputs ---------------------
{
  const stats = buildStatistics({
    pages: [
      { id: 'a/index.mdx', body: 'hello world foo bar', data: { categories: ['Consensus', 'Wallets'] } },
      { id: 'b/index.mdx', body: 'baz qux', data: { categories: ['Consensus'] } },
    ],
    historyForSlug: (slug) =>
      slug === 'a'
        ? [{ date: '2024-01-02T00:00:00.000Z' }, { date: '2024-01-01T00:00:00.000Z' }]
        : [{ date: '2024-01-01T00:00:00.000Z' }],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
  });

  assert.equal(stats.totalArticles, 2, 'totalArticles must be the page count');
  assert.equal(stats.totalTopics, 2, 'totalTopics must be the distinct category count');
  assert.equal(stats.totalWords, 6, 'totalWords must sum body word counts (4 + 2)');
  assert.equal(stats.averageWords, 3, 'averageWords must be totalWords / totalArticles');
  assert.equal(stats.totalRevisions, 3, 'totalRevisions must sum history lengths (2 + 1)');
  assert.equal(stats.averageRevisions, 2, 'averageRevisions must be round(totalRevisions / totalArticles) = round(3/2) = 2');
  assert.equal(stats.newestDate, '2024-01-02T00:00:00.000Z', 'newestDate must be the latest history date');
  assert.equal(stats.oldestDate, '2024-01-01T00:00:00.000Z', 'oldestDate must be the earliest history date');
  assert.equal(stats.largestTopic.name, 'Consensus', 'largestTopic must be the highest-count category');
  assert.equal(stats.largestTopic.count, 2, 'largestTopic.count must reflect member count');
  assert.deepEqual(
    stats.topics,
    [{ name: 'Consensus', count: 2 }, { name: 'Wallets', count: 1 }],
    'topics must be ordered count-desc then compareTitles-asc',
  );
}

// ---- 1a) a category repeated in one article's frontmatter counts once -----
{
  const stats = buildStatistics({
    pages: [
      { id: 'a/index.mdx', body: '', data: { categories: ['TAO', 'TAO'] } },
    ],
    historyForSlug: () => [],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
  });
  assert.equal(stats.totalTopics, 1, 'a duplicated category is one distinct topic');
  assert.deepEqual(
    stats.topics,
    [{ name: 'TAO', count: 1 }],
    'a category listed twice by one article must count that article once (TAO => 1, not 2)',
  );
  assert.equal(stats.largestTopic.count, 1, 'largestTopic.count must reflect the deduped article count');
}

// ---- 1a') the categoriesIndex branch dedupes repeated slugs too -----------
{
  const stats = buildStatistics({
    pages: [],
    historyForSlug: () => [],
    getPageSlug: (page) => page.id,
    categoriesIndex: { TAO: ['alpha', 'alpha', 'beta'] },
  });
  assert.deepEqual(
    stats.topics,
    [{ name: 'TAO', count: 2 }],
    'a slug repeated in a category index must count once (distinct alpha, beta => 2)',
  );
}

// ---- 2) Tiebreak uses compareTitles (NOT raw string) — prevents HTML/JSON drift
//
// This is the exact regression Codex flagged on #388: raw string comparison
// puts "Subnet 10" before "Subnet 9" (lexicographic), while compareTitles
// (numeric: true) puts "Subnet 9" before "Subnet 10". The HTML page uses
// compareTitles; the JSON builder must match.
{
  const tied = buildStatistics({
    pages: [
      { id: 'x/index.mdx', body: '', data: { categories: ['Subnet 9', 'Subnet 10'] } },
      { id: 'y/index.mdx', body: '', data: { categories: ['Subnet 9', 'Subnet 10'] } },
    ],
    historyForSlug: () => [],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
  });
  // Both topics have count 2. compareTitles with numeric:true puts 9 before 10;
  // raw string comparison would put 10 before 9. Asserting 9-first proves the
  // builder uses compareTitles (matching the HTML page), not raw string.
  assert.equal(tied.topics[0].name, 'Subnet 9', 'tied numeric-suffixed topics must use compareTitles (numeric order: Subnet 9 before Subnet 10), NOT raw string order');
  assert.equal(tied.topics[1].name, 'Subnet 10', 'tied numeric-suffixed topics must use compareTitles (numeric order)');
  assert.equal(tied.largestTopic.name, 'Subnet 9', 'largestTopic must reflect compareTitles order, matching the HTML page');
}

// ---- 3) Empty-pages edge case: zero counts, no crash ----------------------
{
  const empty = buildStatistics({
    pages: [],
    historyForSlug: () => [],
    getPageSlug: () => '',
  });
  assert.equal(empty.totalArticles, 0);
  assert.equal(empty.totalTopics, 0);
  assert.equal(empty.totalWords, 0);
  assert.equal(empty.averageWords, 0);
  assert.equal(empty.totalRevisions, 0);
  assert.equal(empty.averageRevisions, 0);
  assert.equal(empty.newestDate, '');
  assert.equal(empty.oldestDate, '');
  assert.equal(empty.largestTopic, null);
  assert.deepEqual(empty.topics, []);
}

// ---- 4) Built output: validate EVERY field in dist/wiki/special/statistics.json
const distStats = path.join(projectRoot, 'dist', 'wiki', 'special', 'statistics.json');
assert.ok(fs.existsSync(distStats), 'dist/wiki/special/statistics.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distStats, 'utf8'));

// site — non-empty URL/origin string.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);

// statisticsJsonUrl — the endpoint's own canonical URL, the same self-URL
// categories.json / allpages.json / recentchanges.json already expose, so a
// consumer that received the document out of band can resolve its source.
assert.equal(
  data.statisticsJsonUrl,
  `${data.site}/wiki/special/statistics.json`,
  `statisticsJsonUrl must be the canonical absolute URL of the endpoint itself (got ${JSON.stringify(data.statisticsJsonUrl)})`,
);

// Core numeric fields.
assert.ok(typeof data.totalArticles === 'number' && data.totalArticles > 0, 'totalArticles must be a positive number');
assert.ok(typeof data.totalTopics === 'number' && data.totalTopics > 0, 'totalTopics must be a positive number');
assert.ok(typeof data.totalRevisions === 'number' && data.totalRevisions >= 0, 'totalRevisions must be a non-negative number');
assert.ok(typeof data.totalWords === 'number' && data.totalWords >= 0, 'totalWords must be a non-negative number');
assert.ok(typeof data.averageWords === 'number' && data.averageWords >= 0, 'averageWords must be a non-negative number');
assert.ok(typeof data.averageRevisions === 'number' && data.averageRevisions >= 0, 'averageRevisions must be a non-negative number');
assert.equal(data.averageRevisions, data.totalArticles ? Math.round(data.totalRevisions / data.totalArticles) : 0, 'averageRevisions must equal round(totalRevisions / totalArticles)');

// newestDate — valid ISO-8601 date string when articles exist.
assert.ok(
  typeof data.newestDate === 'string' && data.newestDate.length > 0,
  `newestDate must be a non-empty date string when articles exist (got ${JSON.stringify(data.newestDate)})`,
);
assert.ok(
  !Number.isNaN(new Date(data.newestDate).getTime()),
  `newestDate must be a valid date (got ${JSON.stringify(data.newestDate)})`,
);

// oldestDate — valid ISO-8601 date string when articles exist, and not after newestDate.
assert.ok(
  typeof data.oldestDate === 'string' && data.oldestDate.length > 0,
  `oldestDate must be a non-empty date string when articles exist (got ${JSON.stringify(data.oldestDate)})`,
);
assert.ok(
  !Number.isNaN(new Date(data.oldestDate).getTime()),
  `oldestDate must be a valid date (got ${JSON.stringify(data.oldestDate)})`,
);
assert.ok(
  data.oldestDate <= data.newestDate,
  `oldestDate must not be after newestDate (${data.oldestDate} > ${data.newestDate})`,
);

const historyDir = path.join(projectRoot, 'public', 'history');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');
let expectedOldest = '';
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history ?? [];
  for (const entry of history) {
    const date = entry?.date ?? '';
    if (!date) continue;
    if (!expectedOldest || date < expectedOldest) expectedOldest = date;
  }
}
assert.equal(
  data.oldestDate,
  expectedOldest,
  'oldestDate must equal the earliest revision date across public/history/*.json',
);

// largestTopic — object with non-empty name + positive count, consistent with topics[0].
assert.ok(
  data.largestTopic !== null && typeof data.largestTopic === 'object',
  `largestTopic must be an object when articles exist (got ${JSON.stringify(data.largestTopic)})`,
);
assert.ok(
  typeof data.largestTopic.name === 'string' && data.largestTopic.name.length > 0,
  `largestTopic.name must be a non-empty string (got ${JSON.stringify(data.largestTopic.name)})`,
);
assert.ok(
  typeof data.largestTopic.count === 'number' && data.largestTopic.count > 0,
  `largestTopic.count must be a positive number (got ${data.largestTopic.count})`,
);
assert.equal(data.largestTopic.name, data.topics[0].name, 'largestTopic.name must match topics[0].name');
assert.equal(data.largestTopic.count, data.topics[0].count, 'largestTopic.count must match topics[0].count');
// slug is the url-safe category identifier (spaces → underscores), the same
// field categories.json now exposes per category, so the two surfaces agree.
assert.equal(
  data.largestTopic.slug,
  data.largestTopic.name.replace(/ /g, '_'),
  'largestTopic.slug must be the url-safe category slug',
);
assert.equal(
  data.largestTopic.url,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/`,
  'largestTopic.url must be the canonical absolute category URL',
);
assert.equal(
  data.largestTopic.articlesUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/articles.json`,
  "largestTopic.articlesUrl must be the canonical absolute category articles.json URL",
);
// articlesJsonUrl is the same article-list link under the consistent <name>JsonUrl
// key the rest of the API uses; it must equal articlesUrl (kept for back-compat).
assert.equal(
  data.largestTopic.articlesJsonUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/articles.json`,
  "largestTopic.articlesJsonUrl must be the canonical absolute category articles.json URL",
);
assert.equal(
  data.largestTopic.articlesJsonUrl,
  data.largestTopic.articlesUrl,
  'largestTopic.articlesJsonUrl must equal the back-compat articlesUrl',
);
assert.equal(
  data.largestTopic.feedUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/feed.json`,
  "largestTopic.feedUrl must be the canonical absolute category feed.json URL",
);
assert.equal(
  data.largestTopic.feedJsonUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/feed.json`,
  "largestTopic.feedJsonUrl must be the canonical absolute category feed.json URL",
);
assert.equal(
  data.largestTopic.feedJsonUrl,
  data.largestTopic.feedUrl,
  'largestTopic.feedJsonUrl must equal the back-compat feedUrl',
);
assert.equal(
  data.largestTopic.atomUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/atom.xml`,
  'largestTopic.atomUrl must be the canonical absolute category Atom feed URL',
);
assert.equal(
  data.largestTopic.rssUrl,
  `${data.site}/wiki/category/${data.largestTopic.name.replace(/ /g, '_')}/rss.xml`,
  'largestTopic.rssUrl must be the canonical absolute category RSS feed URL',
);

// topics — array whose length matches totalTopics, ordered count-desc then
// compareTitles-asc (NOT raw string — must match the HTML page's ordering).
assert.ok(Array.isArray(data.topics) && data.topics.length === data.totalTopics, 'topics must be an array whose length matches totalTopics');
// Every topic must carry a url pointing at its canonical category page — the
// same URL shape the categories.json endpoint uses, so consumers of either
// endpoint reach the same category hub.
for (const topic of data.topics) {
  // slug is the url-safe category identifier (spaces → underscores), the same
  // per-entry field categories.json exposes, so the two topic surfaces agree.
  assert.equal(
    topic.slug,
    topic.name.replace(/ /g, '_'),
    `topic "${topic.name}" slug must be the url-safe category slug`,
  );
  assert.equal(
    topic.url,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/`,
    `topic "${topic.name}" url must be the canonical absolute category URL`,
  );
  // articlesUrl points at the topic's machine-readable article list, the same
  // companion categories.json exposes per category, so a consumer of either
  // endpoint can fetch the topic's articles without rebuilding the route.
  assert.equal(
    topic.articlesUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/articles.json`,
    `topic "${topic.name}" articlesUrl must be the canonical absolute category articles.json URL`,
  );
  // articlesJsonUrl is the same link under the consistent <name>JsonUrl key the
  // rest of the API and the category page envelope use; equals articlesUrl.
  assert.equal(
    topic.articlesJsonUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/articles.json`,
    `topic "${topic.name}" articlesJsonUrl must be the canonical absolute category articles.json URL`,
  );
  assert.equal(
    topic.articlesJsonUrl,
    topic.articlesUrl,
    `topic "${topic.name}" articlesJsonUrl must equal the back-compat articlesUrl`,
  );
  // feedUrl points at the topic's JSON Feed, the syndication companion
  // categories.json also exposes, for feed-reader/programmatic subscription.
  assert.equal(
    topic.feedUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/feed.json`,
    `topic "${topic.name}" feedUrl must be the canonical absolute category feed.json URL`,
  );
  assert.equal(
    topic.feedJsonUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/feed.json`,
    `topic "${topic.name}" feedJsonUrl must be the canonical absolute category feed.json URL`,
  );
  assert.equal(
    topic.feedJsonUrl,
    topic.feedUrl,
    `topic "${topic.name}" feedJsonUrl must equal the back-compat feedUrl`,
  );
  // atomUrl / rssUrl point at the topic's Atom and RSS feeds, which exist for
  // every category alongside the JSON Feed. A feed reader that speaks Atom/RSS
  // can subscribe to a topic straight from the statistics document.
  assert.equal(
    topic.atomUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/atom.xml`,
    `topic "${topic.name}" atomUrl must be the canonical absolute category Atom feed URL`,
  );
  assert.equal(
    topic.rssUrl,
    `${data.site}/wiki/category/${topic.name.replace(/ /g, '_')}/rss.xml`,
    `topic "${topic.name}" rssUrl must be the canonical absolute category RSS feed URL`,
  );
}
for (let i = 1; i < data.topics.length; i++) {
  const prev = data.topics[i - 1];
  const curr = data.topics[i];
  if (prev.count === curr.count) {
    // Same count: compareTitles order. We can't call compareTitles here without
    // importing it, but we CAN assert the ordering is NOT raw-string-descending
    // for numeric-suffixed pairs (the exact drift Codex flagged). A raw-string
    // sort would put "Subnet 10" before "Subnet 9"; compareTitles puts "9" first.
    // For non-numeric names, both comparators agree, so this assertion is a
    // safety net that only triggers on the drift case.
    assert.ok(
      !(prev.name.match(/\d+$/) && curr.name.match(/\d+$/) && prev.name > curr.name),
      `topics with same count and numeric suffixes must use compareTitles (numeric) order, not raw string: "${prev.name}" before "${curr.name}" looks like raw-string order`,
    );
  } else {
    assert.ok(prev.count > curr.count, `topics must be sorted by count descending: ${prev.count} before ${curr.count}`);
  }
}

console.log(`Statistics JSON check passed (${data.totalArticles} articles, ${data.totalTopics} topics)`);
