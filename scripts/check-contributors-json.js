import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContributors, buildContributorsDocument } from './contributors.js';

// Load-bearing check for Special:Contributors. It pins the aggregation/ranking
// of the pure builder (unit), then verifies the built JSON endpoint and HTML
// page agree with a ground-truth roster recomputed from public/history — so the
// page, the endpoint, and this test all derive from one source of truth.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const jsonFile = path.join(distDir, 'wiki', 'special', 'contributors.json');
const htmlFile = path.join(distDir, 'wiki', 'special', 'contributors', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: aggregation, ranking, edge cases ----------------------------
{
  const historyBySlug = {
    alpha: [
      { authorName: 'Ada', date: '2026-06-10T00:00:00.000Z' },
      { authorName: 'Bo', date: '2026-06-12T00:00:00.000Z' },
      { authorName: 'Ada', date: '2026-06-08T00:00:00.000Z' },
    ],
    beta: [
      { authorName: 'Ada', date: '2026-06-15T00:00:00.000Z' },
      { authorName: 'Bo', date: '2026-06-11T00:00:00.000Z' },
    ],
    // Orphan history: no published title -> excluded entirely.
    ghost: [{ authorName: 'Cy', date: '2026-06-20T00:00:00.000Z' }],
    // Missing author / missing date -> skipped, but valid siblings still count.
    gamma: [
      { date: '2026-06-01T00:00:00.000Z' },
      { authorName: 'Bo' },
      { authorName: 'Bo', date: '2026-06-02T00:00:00.000Z' },
    ],
    delta: [{ authorName: 'Bo', date: '2026-06-13T00:00:00.000Z' }],
    // Whitespace-only author -> treated as absent (no blank-name row).
    epsilon: [{ authorName: '   ', date: '2026-06-14T00:00:00.000Z' }],
  };
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta', epsilon: 'Epsilon' };

  const roster = buildContributors({ historyBySlug, titleBySlug });

  assert.deepEqual(
    roster.map((c) => c.name),
    ['Bo', 'Ada'],
    'ranking: Bo (4 edits) outranks Ada (3 edits); orphan author Cy excluded',
  );

  const ada = roster.find((c) => c.name === 'Ada');
  const bo = roster.find((c) => c.name === 'Bo');
  assert.equal(ada.edits, 3, 'Ada edited 3 times');
  assert.equal(ada.articles, 2, 'Ada touched 2 distinct articles (alpha, beta)');
  assert.equal(ada.firstEdit, '2026-06-08T00:00:00.000Z', 'Ada firstEdit is the earliest date');
  assert.equal(ada.lastEdit, '2026-06-15T00:00:00.000Z', 'Ada lastEdit is the latest date');
  // Bo: one valid edit each in alpha, beta, gamma, delta — the author-less and
  // date-less gamma rows are skipped, so 4 edits across 4 distinct articles.
  assert.equal(bo.edits, 4, 'Bo edited 4 times (author-less/date-less rows skipped)');
  assert.equal(bo.articles, 4, 'Bo touched 4 distinct articles (alpha, beta, gamma, delta)');

  // Ties on edits break by distinct-article count, then by name.
  const tie = buildContributors({
    historyBySlug: {
      a: [{ authorName: 'Zoe', date: '2026-01-02T00:00:00.000Z' }],
      b: [{ authorName: 'Ann', date: '2026-01-01T00:00:00.000Z' }],
    },
    titleBySlug: { a: 'A', b: 'B' },
  });
  assert.deepEqual(tie.map((c) => c.name), ['Ann', 'Zoe'], 'equal edits/articles break by name');

  const doc = buildContributorsDocument({ origin: ORIGIN, contributors: roster });
  assert.equal(doc.site, ORIGIN, 'document: site');
  assert.equal(doc.url, `${ORIGIN}/wiki/special/contributors.json`, 'document: self url');
  assert.equal(doc.count, 2, 'document: count equals roster length');
  assert.equal(doc.totalEdits, 7, 'document: totalEdits sums every contributor');
  assert.equal(doc.contributors.length, 2, 'document: contributors array');

  // Whitespace-only and trimmed names: the blank author contributes no row, and
  // a padded name is normalized so it cannot split one person into two.
  assert.ok(!roster.some((c) => c.name.trim() === ''), 'whitespace-only author must not appear as a contributor');
  const trimmed = buildContributors({
    historyBySlug: { a: [{ authorName: '  Ned  ', date: '2026-01-01T00:00:00.000Z' }] },
    titleBySlug: { a: 'A' },
  });
  assert.equal(trimmed[0].name, 'Ned', 'author names are trimmed');

  const empty = buildContributorsDocument({ origin: ORIGIN, contributors: [] });
  assert.equal(empty.count, 0, 'document: empty count is 0');
  assert.equal(empty.totalEdits, 0, 'document: empty totalEdits is 0');
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(jsonFile), 'dist/wiki/special/contributors.json not found; run the build first');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/contributors/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');

// Ground truth: recompute the roster from public/history joined to the published
// slug set (slugmap), then assert the built JSON serialized exactly that.
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);
const historyBySlug = {};
for (const entry of fs.readdirSync(historyDir)) {
  if (!entry.endsWith('.json')) continue;
  const slug = entry.slice(0, -'.json'.length);
  const data = JSON.parse(fs.readFileSync(path.join(historyDir, entry), 'utf8'));
  historyBySlug[slug] = Array.isArray(data?.history) ? data.history : [];
}

const expected = buildContributorsDocument({
  origin: ORIGIN,
  contributors: buildContributors({ historyBySlug, titleBySlug }),
});

const rawJson = fs.readFileSync(jsonFile, 'utf8');
const doc = JSON.parse(rawJson);
assert.deepEqual(doc, expected, 'contributors.json must equal the roster recomputed from public/history');

// Privacy: this surface must expose only the author name already shown on every
// history page — never an email or commit sha (data minimization, the same rule
// check-history-privacy enforces on the history feeds).
assert.ok(!/[^\s@"]+@[^\s@"]+\.[^\s@"]+/.test(rawJson), 'contributors.json must not contain any email address');
for (const c of doc.contributors) {
  assert.deepEqual(
    Object.keys(c).sort(),
    ['articles', 'edits', 'firstEdit', 'lastEdit', 'name'],
    `json: ${c.name} entry must expose only name/edits/articles/firstEdit/lastEdit (no email/sha)`,
  );
}

// Shape + invariants on the built document.
assert.equal(doc.url, `${ORIGIN}/wiki/special/contributors.json`, 'json: self url');
assert.equal(doc.count, doc.contributors.length, 'json: count equals contributors length');
assert.equal(
  doc.totalEdits,
  doc.contributors.reduce((sum, c) => sum + c.edits, 0),
  'json: totalEdits equals the sum of every contributor edits',
);
assert.ok(doc.count > 1, 'expected more than one contributor to verify ranking');

let prevEdits = Infinity;
for (const c of doc.contributors) {
  assert.equal(typeof c.name, 'string', 'json: contributor name is a string');
  assert.ok(c.name.length > 0, 'json: contributor name is non-empty');
  assert.ok(Number.isInteger(c.edits) && c.edits > 0, `json: ${c.name} edits is a positive integer`);
  assert.ok(Number.isInteger(c.articles) && c.articles > 0, `json: ${c.name} articles is a positive integer`);
  assert.ok(c.articles <= c.edits, `json: ${c.name} distinct articles cannot exceed edits`);
  assert.ok(c.firstEdit <= c.lastEdit, `json: ${c.name} firstEdit must not be after lastEdit`);
  assert.ok(c.edits <= prevEdits, `json: contributors must be ranked by edits descending (${c.name})`);
  prevEdits = c.edits;
}

// HTML parity: the page must list the same contributors in the same order.
const html = fs.readFileSync(htmlFile, 'utf8');
const htmlNames = [...html.matchAll(/<td class="mw-cb-name"[^>]*>([^<]+)<\/td>/g)].map((m) =>
  m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
);
assert.deepEqual(
  htmlNames,
  doc.contributors.map((c) => c.name),
  'the HTML Special:Contributors table must list the same contributors in the same order as the JSON',
);

console.log(
  `Contributors check passed (${doc.count} contributors, ${doc.totalEdits} edits; builder unit + public/history ground-truth + HTML/JSON parity verified)`,
);
