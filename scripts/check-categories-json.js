import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategories } from './categories.js';

// /wiki/special/categories.json exposes the topic index as structured JSON for
// programmatic consumers. The contract is load-bearing: a malformed response, a
// wrong article count, a non-deterministic order, or a topic set that disagrees
// with the rest of the build would silently break downstream consumers. This
// check guards all of those:
//   1) Unit-tests buildCategories with constructed inputs.
//   2) Verifies the ordering uses compareTitles (NOT raw string), matching the
//      HTML Special:Categories page.
//   3) Cross-references the built dist file against public/data/categories.json.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildCategories with constructed inputs ---------------------
{
  const topics = buildCategories({
    pages: [
      { data: { categories: ['Consensus', 'Wallets'] } },
      { data: { categories: ['Consensus'] } },
      { data: {} },
    ],
  });
  assert.deepEqual(
    topics,
    [
      { name: 'Consensus', count: 2 },
      { name: 'Wallets', count: 1 },
    ],
    'topics must count tagged articles and order by compareTitles',
  );
}

// ---- 2) Ordering uses compareTitles (numeric), NOT raw string -------------
{
  const numeric = buildCategories({
    pages: [
      { data: { categories: ['Subnet 10', 'Subnet 2', 'Subnet 9'] } },
    ],
  });
  assert.deepEqual(
    numeric.map((t) => t.name),
    ['Subnet 2', 'Subnet 9', 'Subnet 10'],
    'numeric-suffixed topics must order numerically (Subnet 2 < Subnet 9 < Subnet 10), not by raw string',
  );
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(buildCategories({ pages: [] }), [], 'no pages must yield an empty topic list');
  assert.deepEqual(buildCategories({}), [], 'missing pages must not crash');
}

// ---- 4) Built output: matches public/data/categories.json -----------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'categories.json');
const categoriesJsonPath = path.join(projectRoot, 'public', 'data', 'categories.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/categories.json not found; run the build first');
assert.ok(fs.existsSync(categoriesJsonPath), 'public/data/categories.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const known = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.categoriesJsonUrl, `${data.site}/wiki/special/categories.json`, 'categoriesJsonUrl must be the document\'s own canonical URL');
assert.ok(Array.isArray(data.categories), 'categories must be an array');
assert.equal(data.count, data.categories.length, 'count must equal categories.length');
assert.ok(data.categories.length > 0, 'categories.json must list at least one topic');

const knownNames = new Set(Object.keys(known));
const renderedNames = new Set(data.categories.map((c) => c.name));
assert.equal(
  renderedNames.size,
  knownNames.size,
  `categories.json must list every known topic (${knownNames.size}); got ${renderedNames.size}`,
);
data.categories.forEach((row, i) => {
  assert.ok(typeof row.name === 'string' && row.name.length > 0, `row ${i} name must be a non-empty string`);
  assert.ok(knownNames.has(row.name), `row ${i} topic "${row.name}" is not a known category`);
  assert.ok(Number.isInteger(row.articles) && row.articles > 0, `row ${i} articles must be a positive integer`);
  // slug is the single URL-safe route token (spaces -> underscores) the endpoint
  // builds every category route from, exposed so a consumer can build category
  // routes without re-deriving the escaping — the same slug parity
  // search-data.json exposes per article. Validate it once, then assert every
  // route URL is derived from row.slug (NOT a re-derived name.replace(...)), so
  // the field and the URLs can never silently diverge.
  assert.equal(
    row.slug,
    row.name.replace(/ /g, '_'),
    `row ${i} slug must be the URL-safe form of the name (got ${JSON.stringify(row.slug)})`,
  );
  const base = `${data.site}/wiki/category/${row.slug}`;
  // url is the category hub; articlesUrl its machine-readable article list;
  // feedUrl/atomUrl/rssUrl its JSON/Atom/RSS syndication feeds. All must be the
  // canonical absolute URL derived from row.slug.
  assert.equal(row.url, `${base}/`, `row ${i} url must equal ${base}/`);
  assert.equal(row.articlesUrl, `${base}/articles.json`, `row ${i} articlesUrl must equal ${base}/articles.json`);
  assert.equal(row.feedUrl, `${base}/feed.json`, `row ${i} feedUrl must equal ${base}/feed.json`);
  assert.equal(row.atomUrl, `${base}/atom.xml`, `row ${i} atomUrl must equal ${base}/atom.xml`);
  assert.equal(row.rssUrl, `${base}/rss.xml`, `row ${i} rssUrl must equal ${base}/rss.xml`);
});

console.log(`Categories JSON check passed (${data.count} topics)`);
