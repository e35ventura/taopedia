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
  assert.ok(
    row.url.startsWith(`${data.site}/wiki/category/`),
    `row ${i} url must be absolute and start with the envelope site (got ${row.url})`,
  );
  assert.equal(
    row.url,
    `${data.site}/wiki/category/${row.name.replace(/ /g, '_')}/`,
    `row ${i} url must equal ${data.site}/wiki/category/${row.name.replace(/ /g, '_')}/`,
  );
  // articlesUrl points at the category's machine-readable article list
  // (/wiki/category/<slug>/articles.json), the companion the HTML url omits, so
  // a consumer of the category index can fetch each category's articles without
  // reconstructing the route. Same absolute-URL contract as url.
  assert.ok(
    row.articlesUrl.startsWith(`${data.site}/wiki/category/`),
    `row ${i} articlesUrl must be absolute and start with the envelope site (got ${row.articlesUrl})`,
  );
  assert.equal(
    row.articlesUrl,
    `${data.site}/wiki/category/${row.name.replace(/ /g, '_')}/articles.json`,
    `row ${i} articlesUrl must equal ${data.site}/wiki/category/${row.name.replace(/ /g, '_')}/articles.json`,
  );
});

console.log(`Categories JSON check passed (${data.count} topics)`);
