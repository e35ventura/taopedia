import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecentChanges } from './recent-changes.js';

// /wiki/special/recentchanges.json exposes the site-wide newest-first
// revision feed as structured JSON for programmatic consumers. The contract
// is load-bearing: a malformed response, a wrong date, a non-deterministic
// order, or a feed that disagrees with the HTML page would silently break
// every downstream consumer. This check guards all of those:
//   1) Unit-tests buildRecentChanges with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the slug tiebreak uses compareTitles (NOT raw string), so the
//      JSON and HTML surfaces never disagree on numeric-suffixed slugs.
//   3) Re-derives the expected feed from public/history/*.json + the slug map
//      and asserts the built JSON matches it field-for-field (limit, order,
//      membership, date, author, url).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildRecentChanges with constructed inputs ----------------
{
  const ranked = buildRecentChanges({
    historyBySlug: {
      a: [
        { date: '2024-01-03T00:00:00.000Z', authorName: 'Alice' },
        { date: '2024-01-01T00:00:00.000Z', authorName: 'Bob' },
      ],
      b: [
        { date: '2024-01-02T00:00:00.000Z', authorName: 'Carol' },
      ],
    },
    titleBySlug: { a: 'Alpha', b: 'Beta' },
    limit: 10,
  });
  assert.equal(ranked.length, 3, 'must flatten all per-slug history entries');
  assert.equal(ranked[0].slug, 'a', 'newest date first (a: 2024-01-03)');
  assert.equal(ranked[0].date, '2024-01-03T00:00:00.000Z');
  assert.equal(ranked[0].authorName, 'Alice');
  assert.equal(ranked[1].slug, 'b', 'next date (b: 2024-01-02)');
  assert.equal(ranked[2].slug, 'a', 'oldest date last (a: 2024-01-01)');
}

// Skips: empty dates, missing titles, non-array history, unknown slugs.
{
  const ranked = buildRecentChanges({
    historyBySlug: {
      a: [{ date: '2024-01-02T00:00:00.000Z' }, { date: '' }, { authorName: 'NoDate' }],
      b: [{ date: '2024-01-01T00:00:00.000Z' }],
      ghost: [{ date: '2024-01-05T00:00:00.000Z' }], // no title → skipped
      noHist: null,
    },
    titleBySlug: { a: 'Alpha', b: 'Beta' },
    limit: 10,
  });
  assert.equal(ranked.length, 2, 'empty dates, unknown slugs, and non-array history must be skipped');
  assert.equal(ranked[0].slug, 'a');
  assert.equal(ranked[1].slug, 'b');
}

// limit caps the result.
{
  const ranked = buildRecentChanges({
    historyBySlug: {
      a: [
        { date: '2024-01-03T00:00:00.000Z' },
        { date: '2024-01-02T00:00:00.000Z' },
        { date: '2024-01-01T00:00:00.000Z' },
      ],
    },
    titleBySlug: { a: 'Alpha' },
    limit: 2,
  });
  assert.equal(ranked.length, 2, 'limit must cap the result newest-first');
  assert.equal(ranked[0].date, '2024-01-03T00:00:00.000Z');
  assert.equal(ranked[1].date, '2024-01-02T00:00:00.000Z');
}

// limit <= 0 returns everything.
{
  const ranked = buildRecentChanges({
    historyBySlug: { a: [{ date: '2024-01-01T00:00:00.000Z' }] },
    titleBySlug: { a: 'Alpha' },
    limit: 0,
  });
  assert.equal(ranked.length, 1, 'limit <= 0 must return the full feed');
}

// ---- 2) Tiebreak uses compareTitles (NOT raw string) --------------------
//
// Same-date numeric-suffixed slugs must order numerically (subnet_9 before
// subnet_10), the SAME ordering the HTML page uses. Raw string comparison
// would put subnet_10 before subnet_9.
{
  const tied = buildRecentChanges({
    historyBySlug: {
      subnet_10: [{ date: '2024-01-01T00:00:00.000Z' }],
      subnet_9: [{ date: '2024-01-01T00:00:00.000Z' }],
    },
    titleBySlug: { subnet_9: 'Subnet 9', subnet_10: 'Subnet 10' },
    limit: 10,
  });
  assert.deepEqual(
    tied.map((e) => e.slug),
    ['subnet_9', 'subnet_10'],
    'tied numeric-suffixed slugs must use compareTitles (subnet_9 before subnet_10), NOT raw string order',
  );
}

// ---- 3) Empty input edge case ------------------------------------------
{
  assert.deepEqual(buildRecentChanges({ historyBySlug: {}, titleBySlug: {}, limit: 10 }), [], 'empty input must yield an empty feed');
  assert.deepEqual(buildRecentChanges({ historyBySlug: undefined, titleBySlug: undefined, limit: 10 }), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the actual history + slug map ----
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'recentchanges.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/recentchanges.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

// site — non-empty URL/origin string.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);

// limit and count fields.
assert.ok(typeof data.limit === 'number' && data.limit > 0, `limit must be a positive number (got ${data.limit})`);
assert.equal(data.limit, 100, 'limit must be the 100-row cap the HTML page uses');
assert.ok(typeof data.count === 'number' && data.count >= 0, `count must be a non-negative number (got ${data.count})`);
assert.equal(data.count, data.changes.length, 'count must equal changes.length');

// changes — non-empty array (Taopedia has hundreds of articles with history).
assert.ok(Array.isArray(data.changes), 'changes must be an array');
assert.ok(data.changes.length > 0, 'recentchanges.json must list at least one revision');
assert.ok(data.changes.length <= data.limit, `changes.length (${data.changes.length}) must not exceed limit (${data.limit})`);

// Re-derive the expected feed from public/history/<slug>.json + slugmap.json.
// Same builder used by the endpoint, same inputs the endpoint reads — the
// JSON must match it field-for-field.
const titleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) titleBySlug[slug] = entry.title;

const historyBySlug = {};
const historyDir = path.join(projectRoot, 'public', 'history');
if (fs.existsSync(historyDir)) {
  for (const file of fs.readdirSync(historyDir)) {
    if (!file.endsWith('.json')) continue;
    const slug = file.slice(0, -'.json'.length);
    const parsed = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
    historyBySlug[slug] = Array.isArray(parsed?.history) ? parsed.history : [];
  }
}
const expected = buildRecentChanges({ historyBySlug, titleBySlug, limit: data.limit });

assert.equal(
  data.changes.length,
  expected.length,
  `recentchanges.json must list all ${expected.length} revisions within the limit (got ${data.changes.length})`,
);
data.changes.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the history-derived feed`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map title for ${expected[i].slug}`);
  assert.equal(row.url, `/wiki/${expected[i].slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.date, expected[i].date, `row ${i} date must match the history entry for ${expected[i].slug}`);
  assert.equal(
    row.author || null,
    expected[i].authorName || null,
    `row ${i} author must match the history entry for ${expected[i].slug}`,
  );
});

// Newest-first ordering: every row's date must be >= the next row's date.
for (let i = 1; i < data.changes.length; i++) {
  assert.ok(
    data.changes[i - 1].date >= data.changes[i].date,
    `rows must be sorted newest-first (row ${i - 1}=${data.changes[i - 1].date} < row ${i}=${data.changes[i].date})`,
  );
}

console.log(`Recent changes JSON check passed (${data.count} revisions, newest=${data.changes[0]?.slug}@${data.changes[0]?.date})`);
