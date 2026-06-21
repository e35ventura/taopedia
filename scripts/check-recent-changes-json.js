import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecentChanges, buildRecentChangesFromDisk, RECENT_LIMIT } from './recent-changes.js';

// /wiki/special/recentchanges.json exposes the site-wide newest-first
// revision feed as structured JSON for programmatic consumers. The contract
// is load-bearing: a malformed response, a wrong date, a non-deterministic
// order, or a feed that disagrees with the HTML page would silently break
// every downstream consumer. This check guards all of those:
//   1) Unit-tests buildRecentChanges with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the slug tiebreak uses compareTitles (NOT raw string), so the
//      JSON and HTML surfaces never disagree on numeric-suffixed slugs.
//   3) Cross-references the built dist file against the HTML page's rendered
//      feed so the two surfaces cannot drift.

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
      b: [{ date: '2024-01-02T00:00:00.000Z', authorName: 'Carol' }],
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
  assert.equal(ranked.length, 2, 'only dated entries on titled slugs are emitted');
  assert.equal(ranked[0].slug, 'a');
  assert.equal(ranked[0].authorName, undefined, 'no authorName is preserved as undefined');
  assert.equal(ranked[1].slug, 'b');
}

// Same-timestamp tiebreak uses compareTitles, not raw string. subnet_10 must
// follow subnet_9 (numeric), not precede it (lexicographic).
{
  const ranked = buildRecentChanges({
    historyBySlug: {
      'subnet_10': [{ date: '2024-01-01T00:00:00.000Z' }],
      'subnet_9': [{ date: '2024-01-01T00:00:00.000Z' }],
    },
    titleBySlug: { 'subnet_10': 'Subnet 10', 'subnet_9': 'Subnet 9' },
    limit: 10,
  });
  assert.equal(ranked[0].slug, 'subnet_9', 'subnet_9 must come before subnet_10 (numeric, not raw string)');
  assert.equal(ranked[1].slug, 'subnet_10');
}

// Limit semantics: 0 / negative means unlimited; positive is a hard cap.
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
  assert.equal(ranked.length, 2, 'limit caps the output');
  assert.equal(ranked[0].date, '2024-01-03T00:00:00.000Z', 'still newest-first');
  assert.equal(ranked[1].date, '2024-01-02T00:00:00.000Z');

  const unlimited = buildRecentChanges({
    historyBySlug: { a: [{ date: '2024-01-01T00:00:00.000Z' }] },
    titleBySlug: { a: 'Alpha' },
    limit: 0,
  });
  assert.equal(unlimited.length, 1, 'limit=0 means unlimited (no slice)');
}

// Empty / missing inputs do not crash.
{
  assert.deepEqual(
    buildRecentChanges({ historyBySlug: {}, titleBySlug: {}, limit: 10 }),
    [],
    'empty inputs yield an empty feed',
  );
  assert.deepEqual(
    buildRecentChanges({ historyBySlug: undefined, titleBySlug: undefined, limit: 10 }),
    [],
    'missing inputs do not crash',
  );
}

// ---- 2) Built output: validate against the rendered HTML page -------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'recentchanges.json');
const htmlFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'recentchanges', 'index.html');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/recentchanges.json not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));

// site + envelope.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);
assert.equal(data.limit, RECENT_LIMIT, `limit must equal the page's RECENT_LIMIT (${RECENT_LIMIT})`);
assert.ok(typeof data.count === 'number' && data.count > 0, 'count must be a positive number');
assert.equal(data.count, data.changes.length, 'count must equal changes.length');
assert.ok(Array.isArray(data.changes), 'changes must be an array');

// Re-derive the expected feed from public/history/*.json + public/data/slugmap.json
// (the same ground truth the HTML page renders against) and assert every
// per-row field agrees.
const disk = buildRecentChangesFromDisk({ limit: RECENT_LIMIT });
const html = fs.readFileSync(htmlFile, 'utf8');

// Each built JSON row's date must appear in the HTML page (proves the same
// commit is rendered on both surfaces) and the corresponding slug must be
// present in the slug map. The slug map is `{ slug: { title, categories, summary } }`,
// so `slugMap[slug].title` is the title field, not the slug itself.
const slugMap = disk.slugMap;
assert.ok(Object.keys(slugMap).length > 0, 'slug map must list at least one article');

data.changes.forEach((row, i) => {
  assert.ok(typeof row.slug === 'string' && row.slug.length > 0, `row ${i} slug must be a non-empty string`);
  assert.ok(typeof row.title === 'string' && row.title.length > 0, `row ${i} title must be a non-empty string`);
  assert.ok(slugMap[row.slug] && slugMap[row.slug].title === row.title, `row ${i} title must match the slug map`);
  assert.ok(
    row.date && !Number.isNaN(Date.parse(row.date)),
    `row ${i} date must parse as a valid ISO 8601 string (got ${row.date})`,
  );
  assert.equal(row.url, `/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.historyUrl, `/wiki/${row.slug}/history/`, `row ${i} historyUrl must be the article's history page`);
  // The HTML page renders the same row with the same date. The check
  // substring-tests because the rendered date string can carry a timezone
  // abbreviation; the ISO 8601 datetime= attribute is what we want to pin.
  assert.ok(
    html.includes(`datetime="${row.date}"`),
    `row ${i} date ${row.date} must appear in the rendered HTML page (datetime= attribute)`,
  );
  assert.ok(
    html.includes(`href="/wiki/${row.slug}/"`),
    `row ${i} slug ${row.slug} must appear in the rendered HTML page (article link)`,
  );
});

// JSON and disk-derived feed must agree field-for-field (count, order, membership).
assert.equal(
  data.changes.length,
  disk.changes.length,
  `recentchanges.json must list all ${disk.changes.length} changes derived from public/history/*.json (got ${data.changes.length})`,
);
data.changes.forEach((row, i) => {
  assert.equal(row.slug, disk.changes[i].slug, `row ${i} slug must match the disk-derived feed`);
  assert.equal(row.title, disk.changes[i].title, `row ${i} title must match the disk-derived feed`);
  assert.equal(row.date, disk.changes[i].date, `row ${i} date must match the disk-derived feed`);
  assert.equal(
    row.author,
    disk.changes[i].authorName ?? null,
    `row ${i} author must match the disk-derived feed (null when blank)`,
  );
});

// Newest-first ordering (the bug if anyone reintroduces a raw date sort or
// swaps the comparison direction).
for (let i = 1; i < data.changes.length; i++) {
  assert.ok(
    data.changes[i - 1].date >= data.changes[i].date,
    `changes must be sorted newest-first (row ${i - 1} ${data.changes[i - 1].date} < row ${i} ${data.changes[i].date})`,
  );
}

console.log(
  `Recent changes JSON check passed (${data.count} changes, newest ${data.changes[0]?.date}, oldest ${data.changes[data.changes.length - 1]?.date}, html+json surfaces agree)`,
);
