import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildOrphanPages } from './orphan-pages.js';
import { publishedInboundLinkCount } from './most-linked.js';

// /wiki/special/orphanpages.json exposes published articles with zero inbound
// links as structured JSON for programmatic consumers. The contract is
// load-bearing: a malformed response, a wrong membership set, a non-deterministic
// order, or a list that disagrees with the backlink graph would silently break
// maintenance tooling. This check guards all of those:
//   1) Unit-tests buildOrphanPages with constructed inputs.
//   2) Verifies ordering uses compareTitles (NOT raw string).
//   3) Re-derives the expected list from public/data/backlinks.json +
//      slugmap.json and asserts the built JSON matches field-for-field.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildOrphanPages with constructed inputs --------------------
{
  const orphans = buildOrphanPages({
    backlinks: {
      a: [{ from: 'b' }],
      b: [{ from: 'a' }],
      c: [],
      d: [{ from: 'ghost' }],
      ghost: [{ from: 'd' }],
    },
    titleBySlug: { a: 'Alpha', b: 'Beta', c: 'Gamma', d: 'Delta' },
  });
  assert.deepEqual(
    orphans.map((entry) => entry.slug),
    ['d', 'c'],
    'orphans must be published articles with zero published inbound links, sorted by compareTitles(title)',
  );
}

// ---- 1b) Self-links do not disqualify orphan status -----------------------
{
  const orphans = buildOrphanPages({
    backlinks: {
      solo: [{ from: 'solo' }, { from: 'ghost' }],
    },
    titleBySlug: { solo: 'Solo' },
  });
  assert.deepEqual(orphans, [{ slug: 'solo', title: 'Solo' }], 'a self-link must not count as an inbound link');
}

// ---- 2) Ordering uses compareTitles (numeric), NOT raw string -------------
{
  const orphans = buildOrphanPages({
    backlinks: {
      subnet_9: [],
      subnet_10: [],
      x: [{ from: 'y' }],
      y: [{ from: 'x' }],
    },
    titleBySlug: { subnet_9: 'Subnet 9', subnet_10: 'Subnet 10', x: 'X', y: 'Y' },
  });
  assert.deepEqual(
    orphans.map((entry) => entry.slug),
    ['subnet_9', 'subnet_10'],
    'numeric-suffixed orphans must order numerically (Subnet 9 before Subnet 10), not by raw string',
  );
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(buildOrphanPages({ backlinks: {}, titleBySlug: {} }), [], 'empty input must yield an empty list');
  assert.deepEqual(buildOrphanPages({}), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the backlink graph ---------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'orphanpages.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/orphanpages.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, meta?.title ?? slug]),
);

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.orphanpagesJsonUrl,
  `${data.site}/wiki/special/orphanpages.json`,
  'orphanpagesJsonUrl must be the canonical self-URL of the endpoint',
);
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');

const expected = buildOrphanPages({ backlinks, titleBySlug });
assert.equal(data.pages.length, expected.length, `orphanpages.json must list all ${expected.length} orphan articles`);

data.pages.forEach((row, i) => {
  const exp = expected[i];
  assert.equal(row.slug, exp.slug, `row ${i} slug must match the backlink graph`);
  assert.equal(row.title, exp.title, `row ${i} title must match slugmap`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.backlinksUrl, `${data.site}/wiki/${row.slug}/backlinks/`, `row ${i} backlinksUrl must point to the HTML backlinks page`);
  assert.equal(row.backlinksJsonUrl, `${data.site}/wiki/${row.slug}/backlinks.json`, `row ${i} backlinksJsonUrl must point to the machine-readable backlinks endpoint`);
  assert.ok(fs.existsSync(path.join(wikiDir, row.slug, 'index.html')), `row ${i} must reference a built article page`);
  assert.equal(
    publishedInboundLinkCount(backlinks, row.slug, titleBySlug),
    0,
    `row ${i} ${row.slug} must have zero published inbound links`,
  );
});

// ---- 5) Parity with per-article backlinks.json + allpages.json ----------
// check-backlinks-json.js requires withEmpty > 0 (articles whose backlinks.json
// reports count === 0). orphanpages.json must list exactly those slugs.
const orphanSlugs = new Set(data.pages.map((row) => row.slug));
for (const row of data.pages) {
  const backlinksJson = path.join(wikiDir, row.slug, 'backlinks.json');
  assert.ok(fs.existsSync(backlinksJson), `${row.slug}: orphan must have a built backlinks.json`);
  const doc = JSON.parse(fs.readFileSync(backlinksJson, 'utf8'));
  assert.equal(doc.count, 0, `${row.slug}: backlinks.json count must be 0 for an orphan`);
  assert.equal(
    doc.incomingLinks ?? doc.backlinks,
    0,
    `${row.slug}: backlinks.json incomingLinks must be 0 for an orphan`,
  );
}

const allpagesFile = path.join(wikiDir, 'special', 'allpages.json');
assert.ok(fs.existsSync(allpagesFile), 'dist/wiki/special/allpages.json not found; run the build first');
const allpages = JSON.parse(fs.readFileSync(allpagesFile, 'utf8'));
for (const row of allpages.pages ?? []) {
  const isOrphan = row.incomingLinks === 0;
  assert.equal(
    orphanSlugs.has(row.slug),
    isOrphan,
    `orphanpages.json membership must match allpages.json incomingLinks===0 for ${row.slug} (incomingLinks=${row.incomingLinks})`,
  );
}

for (let i = 1; i < data.pages.length; i++) {
  const prev = data.pages[i - 1];
  const cur = data.pages[i];
  assert.ok(
    compareTitles(prev.title, cur.title) <= 0,
    `pages must be sorted by compareTitles(title): ${prev.title} > ${cur.title}`,
  );
  if (prev.title === cur.title) {
    assert.ok(
      compareTitles(prev.slug, cur.slug) <= 0,
      `same-title entries must be ordered by compareTitles(slug): ${prev.slug} > ${cur.slug}`,
    );
  }
}

console.log(`Orphan pages JSON check passed (${data.count} orphan articles)`);
