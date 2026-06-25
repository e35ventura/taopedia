import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { buildDeadEndPages } from './dead-end-pages.js';

// /wiki/special/deadendpages.json exposes published articles with zero outbound
// wiki references as structured JSON for programmatic consumers. The contract is
// load-bearing: a malformed response, a wrong membership set, a non-deterministic
// order, or a list that disagrees with the link graph would silently break
// maintenance tooling. This check guards all of those:
//   1) Unit-tests buildDeadEndPages with constructed inputs.
//   2) Verifies ordering uses compareTitles (NOT raw string).
//   3) Re-derives the expected list from public/data/linkgraph.json +
//      slugmap.json and asserts the built JSON matches field-for-field.
// The build already expects at least one zero-outbound article (see
// check-references-json.js empty-state coverage); this endpoint aggregates that
// signal site-wide.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildDeadEndPages with constructed inputs -------------------
{
  const titleBySlug = { a: 'Alpha', b: 'Beta', c: 'Gamma', d: 'Delta' };
  const linkGraph = {
    a: [{ target: 'b' }],
    b: [{ target: 'a' }],
    c: [],
    d: [{ target: 'missing' }, { target: 'd' }],
  };
  const deadEnds = buildDeadEndPages({ linkGraph, titleBySlug });
  assert.deepEqual(
    deadEnds.map((entry) => entry.slug),
    ['d', 'c'],
    'dead-ends must be published articles with zero published outbound references, sorted by compareTitles(title)',
  );
}

// ---- 1b) Self-links do not count as outbound references -------------------
{
  const deadEnds = buildDeadEndPages({
    linkGraph: {
      solo: [{ target: 'solo' }, { target: 'ghost' }],
    },
    titleBySlug: { solo: 'Solo' },
  });
  assert.deepEqual(deadEnds, [{ slug: 'solo', title: 'Solo' }], 'a self-link must not count as an outbound reference');
}

// ---- 2) Ordering uses compareTitles (numeric), NOT raw string -------------
{
  const deadEnds = buildDeadEndPages({
    linkGraph: {
      subnet_9: [],
      subnet_10: [],
      linked: [{ target: 'other' }],
      other: [{ target: 'linked' }],
    },
    titleBySlug: { subnet_9: 'Subnet 9', subnet_10: 'Subnet 10', linked: 'Linked', other: 'Other' },
  });
  assert.deepEqual(
    deadEnds.map((entry) => entry.slug),
    ['subnet_9', 'subnet_10'],
    'numeric-suffixed dead-ends must order numerically (Subnet 9 before Subnet 10), not by raw string',
  );
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(buildDeadEndPages({ linkGraph: {}, titleBySlug: {} }), [], 'empty input must yield an empty list');
  assert.deepEqual(buildDeadEndPages({}), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the link graph ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'deadendpages.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/deadendpages.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const linkGraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, meta?.title ?? slug]),
);

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.deadendpagesJsonUrl,
  `${data.site}/wiki/special/deadendpages.json`,
  'deadendpagesJsonUrl must be the canonical self-URL of the endpoint',
);
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');

const expected = buildDeadEndPages({ linkGraph, titleBySlug });
assert.equal(data.pages.length, expected.length, `deadendpages.json must list all ${expected.length} dead-end articles`);
assert.ok(data.count > 0, 'expected at least one dead-end article, matching check-references-json empty-state coverage');

data.pages.forEach((row, i) => {
  const exp = expected[i];
  assert.equal(row.slug, exp.slug, `row ${i} slug must match the link graph`);
  assert.equal(row.title, exp.title, `row ${i} title must match slugmap`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.referencesUrl, `${data.site}/wiki/${row.slug}/references.json`, `row ${i} referencesUrl must point to references.json`);
  assert.equal(row.referencesJsonUrl, `${data.site}/wiki/${row.slug}/references.json`, `row ${i} referencesJsonUrl must point to references.json`);
  assert.ok(fs.existsSync(path.join(wikiDir, row.slug, 'index.html')), `row ${i} must reference a built article page`);
  assert.equal(
    getArticleReferences({ slug: row.slug, linkGraph, titleBySlug }).length,
    0,
    `row ${i} ${row.slug} must have zero published outbound references`,
  );
});

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

console.log(`Dead-end pages JSON check passed (${data.count} dead-end articles)`);
