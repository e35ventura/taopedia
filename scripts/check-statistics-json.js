import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatistics } from './statistics.js';

// /wiki/special/statistics.json exposes the site's content statistics as
// structured JSON for programmatic consumers. The contract is small but
// load-bearing: a malformed JSON response, a wrong count, or a non-deterministic
// topic ordering silently breaks every downstream consumer. This check guards
// both:
//   1) Unit-tests buildStatistics with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Parses the built dist/wiki/special/statistics.json and asserts the
//      expected structure and deterministic topic ordering.

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

  // Core counts.
  assert.equal(stats.totalArticles, 2, 'totalArticles must be the page count');
  assert.equal(stats.totalTopics, 2, 'totalTopics must be the distinct category count');
  assert.equal(stats.totalWords, 6, 'totalWords must sum body word counts (4 + 2)');
  assert.equal(stats.averageWords, 3, 'averageWords must be totalWords / totalArticles (6 / 2)');
  assert.equal(stats.totalRevisions, 3, 'totalRevisions must sum history lengths (2 + 1)');
  assert.equal(stats.newestDate, '2024-01-02T00:00:00.000Z', 'newestDate must be the latest history date');

  // Largest topic: Consensus (2 members) beats Wallets (1 member).
  assert.equal(stats.largestTopic.name, 'Consensus', 'largestTopic must be the highest-count category');
  assert.equal(stats.largestTopic.count, 2, 'largestTopic.count must reflect member count');

  // Deterministic topic ordering: count desc, then name asc.
  assert.equal(stats.topics.length, 2, 'topics array must have one entry per category');
  assert.deepEqual(
    stats.topics,
    [{ name: 'Consensus', count: 2 }, { name: 'Wallets', count: 1 }],
    'topics must be ordered count-desc then name-asc (deterministic)',
  );
}

// ---- 2) Tiebreak ordering: same-count topics use raw string comparison ----
{
  const tied = buildStatistics({
    pages: [
      { id: 'x/index.mdx', body: '', data: { categories: ['Subnets', 'Consensus'] } },
      { id: 'y/index.mdx', body: '', data: { categories: ['Subnets', 'Consensus'] } },
    ],
    historyForSlug: () => [],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
  });
  // Both topics have count 2 — raw string order puts Consensus before Subnets.
  assert.equal(tied.topics[0].name, 'Consensus', 'tied topics must break by raw string order');
  assert.equal(tied.topics[1].name, 'Subnets', 'tied topics must break by raw string order');
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
  assert.equal(empty.newestDate, '');
  assert.equal(empty.largestTopic, null);
  assert.deepEqual(empty.topics, []);
}

// ---- 4) Built output: dist/wiki/special/statistics.json is well-formed -----
const distStats = path.join(projectRoot, 'dist', 'wiki', 'special', 'statistics.json');
assert.ok(fs.existsSync(distStats), 'dist/wiki/special/statistics.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distStats, 'utf8'));
assert.ok(typeof data.totalArticles === 'number' && data.totalArticles > 0, 'totalArticles must be a positive number');
assert.ok(typeof data.totalTopics === 'number' && data.totalTopics > 0, 'totalTopics must be a positive number');
assert.ok(typeof data.totalRevisions === 'number' && data.totalRevisions >= 0, 'totalRevisions must be a non-negative number');
assert.ok(typeof data.totalWords === 'number' && data.totalWords >= 0, 'totalWords must be a non-negative number');
assert.ok(typeof data.averageWords === 'number' && data.averageWords >= 0, 'averageWords must be a non-negative number');
assert.ok(Array.isArray(data.topics) && data.topics.length === data.totalTopics, 'topics must be an array whose length matches totalTopics');

// The topics array must be deterministically ordered: count desc, then raw
// string asc. A non-deterministic build (e.g. locale-dependent sort) would
// produce different JSON bytes on different machines.
for (let i = 1; i < data.topics.length; i++) {
  const prev = data.topics[i - 1];
  const curr = data.topics[i];
  if (prev.count === curr.count) {
    assert.ok(
      prev.name < curr.name,
      `topics with the same count must be in raw string order: "${prev.name}" must sort before "${curr.name}"`,
    );
  } else {
    assert.ok(
      prev.count > curr.count,
      `topics must be sorted by count descending: ${prev.count} before ${curr.count}`,
    );
  }
}

console.log(`Statistics JSON check passed (${data.totalArticles} articles, ${data.totalTopics} topics)`);
