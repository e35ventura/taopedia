import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { getRelatedPages } from '../src/lib/related-pages.ts';
import { buildNoRelatedPages } from './no-related-pages.js';

// /wiki/special/norelatedpages.json exposes published articles with no related
// reading suggestions as structured JSON for programmatic consumers. The
// contract is load-bearing: a malformed response, a wrong membership set, a
// non-deterministic order, or a list that disagrees with getRelatedPages would
// silently break maintenance tooling. This check guards all of those:
//   1) Unit-tests buildNoRelatedPages with constructed inputs.
//   2) Verifies ordering uses compareTitles (NOT raw string).
//   3) Re-derives the expected list from public/data/*.json artifacts and
//      asserts the built JSON matches field-for-field.
// The build already expects at least one zero-related article (see
// check-related-json.js empty-state coverage); this endpoint aggregates that
// signal site-wide.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildNoRelatedPages with constructed inputs -----------------
{
  const slugMap = {
    solo: { title: 'Solo', categories: ['Lonely'], summary: '' },
    linked: { title: 'Linked', categories: ['Peers'], summary: '' },
    peer: { title: 'Peer', categories: ['Peers'], summary: '' },
  };
  const categoriesIndex = {
    Lonely: ['solo'],
    Peers: ['linked', 'peer'],
  };
  const backlinks = {};
  const outgoing = {
    linked: [{ target: 'peer' }],
  };
  const titleBySlug = Object.fromEntries(Object.entries(slugMap).map(([slug, meta]) => [slug, meta.title]));
  const publishedSlugs = new Set(Object.keys(titleBySlug));

  const noRelated = buildNoRelatedPages({
    slugMap,
    categoriesIndex,
    backlinks,
    outgoing,
    titleBySlug,
    publishedSlugs,
  });
  assert.deepEqual(
    noRelated.map((entry) => entry.slug),
    ['linked', 'solo'],
    'linked and solo must have no related pages in this fixture (linked already links to its only topic peer; solo is alone in its topic)',
  );
}

// ---- 1b) Backlink-only relations still produce related pages --------------
{
  const slugMap = {
    hub: { title: 'Hub', categories: ['A'], summary: '' },
    spoke: { title: 'Spoke', categories: ['B'], summary: '' },
  };
  const categoriesIndex = { A: ['hub'], B: ['spoke'] };
  const backlinks = { hub: [{ from: 'spoke' }] };
  const outgoing = {};
  const titleBySlug = Object.fromEntries(Object.entries(slugMap).map(([slug, meta]) => [slug, meta.title]));
  const publishedSlugs = new Set(Object.keys(titleBySlug));

  const noRelated = buildNoRelatedPages({ slugMap, categoriesIndex, backlinks, outgoing, titleBySlug, publishedSlugs });
  assert.deepEqual(
    noRelated.map((entry) => entry.slug),
    ['spoke'],
    'spoke must be no-related when it is the only member of its topic and nothing links to it',
  );
}

// ---- 2) Ordering uses compareTitles (numeric), NOT raw string -------------
{
  const slugMap = {
    subnet_9: { title: 'Subnet 9', categories: ['Only9'], summary: '' },
    subnet_10: { title: 'Subnet 10', categories: ['Only10'], summary: '' },
  };
  const categoriesIndex = { Only9: ['subnet_9'], Only10: ['subnet_10'] };
  const titleBySlug = Object.fromEntries(Object.entries(slugMap).map(([slug, meta]) => [slug, meta.title]));
  const publishedSlugs = new Set(Object.keys(titleBySlug));

  const noRelated = buildNoRelatedPages({
    slugMap,
    categoriesIndex,
    backlinks: {},
    outgoing: {},
    titleBySlug,
    publishedSlugs,
  });
  assert.deepEqual(
    noRelated.map((entry) => entry.slug),
    ['subnet_9', 'subnet_10'],
    'numeric-suffixed entries must order numerically (Subnet 9 before Subnet 10), not by raw string',
  );
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(
    buildNoRelatedPages({ slugMap: {}, categoriesIndex: {}, backlinks: {}, outgoing: {}, titleBySlug: {}, publishedSlugs: new Set() }),
    [],
    'empty input must yield an empty list',
  );
  assert.deepEqual(buildNoRelatedPages({}), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the link graph ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'norelatedpages.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const categoriesFile = path.join(projectRoot, 'public', 'data', 'categories.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/norelatedpages.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(categoriesFile), 'public/data/categories.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugMap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const categoriesIndex = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, meta]) => [slug, meta?.title ?? slug]),
);
const publishedSlugs = new Set(Object.keys(titleBySlug));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.norelatedpagesJsonUrl,
  `${data.site}/wiki/special/norelatedpages.json`,
  'norelatedpagesJsonUrl must be the canonical self-URL of the endpoint',
);
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');

const expected = buildNoRelatedPages({
  slugMap,
  categoriesIndex,
  backlinks,
  outgoing: linkgraph,
  titleBySlug,
  publishedSlugs,
});
assert.equal(data.pages.length, expected.length, `norelatedpages.json must list all ${expected.length} no-related articles`);
assert.ok(data.count > 0, 'expected at least one no-related article, matching check-related-json empty-state coverage');

data.pages.forEach((row, i) => {
  const exp = expected[i];
  assert.equal(row.slug, exp.slug, `row ${i} slug must match getRelatedPages`);
  assert.equal(row.title, exp.title, `row ${i} title must match slugmap`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.relatedUrl, `${data.site}/wiki/${row.slug}/related.json`, `row ${i} relatedUrl must point to related.json`);
  assert.equal(row.relatedJsonUrl, `${data.site}/wiki/${row.slug}/related.json`, `row ${i} relatedJsonUrl must point to related.json`);
  assert.ok(fs.existsSync(path.join(wikiDir, row.slug, 'index.html')), `row ${i} must reference a built article page`);
  assert.equal(
    getRelatedPages({
      slug: row.slug,
      slugMap,
      categoriesIndex,
      backlinks,
      outgoing: linkgraph,
      publishedSlugs,
      titleBySlug,
    }).length,
    0,
    `row ${i} ${row.slug} must have zero related pages`,
  );
});

// ---- 5) Parity with per-article related.json ----------------------------
// check-related-json.js requires withEmpty > 0 (articles whose related.json
// reports count === 0). norelatedpages.json must list exactly those slugs.
const noRelatedSlugs = new Set(data.pages.map((row) => row.slug));
for (const row of data.pages) {
  const relatedJson = path.join(wikiDir, row.slug, 'related.json');
  assert.ok(fs.existsSync(relatedJson), `${row.slug}: no-related article must have a built related.json`);
  const doc = JSON.parse(fs.readFileSync(relatedJson, 'utf8'));
  assert.equal(doc.count, 0, `${row.slug}: related.json count must be 0 for a no-related article`);
  assert.deepEqual(doc.related, [], `${row.slug}: related.json related array must be empty`);
}

for (const slug of publishedSlugs) {
  const relatedJson = path.join(wikiDir, slug, 'related.json');
  if (!fs.existsSync(relatedJson)) continue;
  const doc = JSON.parse(fs.readFileSync(relatedJson, 'utf8'));
  const isNoRelated = doc.count === 0;
  assert.equal(
    noRelatedSlugs.has(slug),
    isNoRelated,
    `norelatedpages.json membership must match related.json count===0 for ${slug} (count=${doc.count})`,
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

console.log(`No-related pages JSON check passed (${data.count} articles)`);
