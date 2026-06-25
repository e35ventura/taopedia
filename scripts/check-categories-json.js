import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategories, categorySlug } from './categories.js';

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
      { name: 'Consensus', count: 2, slug: 'Consensus' },
      { name: 'Wallets', count: 1, slug: 'Wallets' },
    ],
    'topics must count tagged articles and order by compareTitles',
  );
}

// ---- 1a) a category repeated in one article's frontmatter counts once -----
{
  const deduped = buildCategories({
    pages: [
      { data: { categories: ['TAO', 'TAO'] } },
      { data: { categories: ['Wallets'] } },
    ],
  });
  assert.deepEqual(
    deduped,
    [
      { name: 'TAO', count: 1, slug: 'TAO' },
      { name: 'Wallets', count: 1, slug: 'Wallets' },
    ],
    'a category listed twice by one article must count that article once (TAO => 1, not 2)',
  );
}

// ---- 1a') the categoriesIndex branch dedupes repeated slugs too -----------
{
  const deduped = buildCategories({
    categoriesIndex: { TAO: ['alpha', 'alpha', 'beta'] },
  });
  assert.deepEqual(
    deduped,
    [{ name: 'TAO', count: 2, slug: 'TAO' }],
    'a slug repeated in a category index must count once (distinct alpha, beta => 2)',
  );
}

// ---- 1b) slug is the url-safe category path segment -----------------------
{
  const topics = buildCategories({
    pages: [{ data: { categories: ['Smart Wallets', 'Subnet 9'] } }],
  });
  assert.equal(topics.find((t) => t.name === 'Smart Wallets')?.slug, 'Smart_Wallets');
  assert.equal(topics.find((t) => t.name === 'Subnet 9')?.slug, 'Subnet_9');
  assert.equal(categorySlug('Smart Wallets'), 'Smart_Wallets');
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
  assert.ok(typeof row.slug === 'string' && row.slug.length > 0, `row ${i} slug must be a non-empty string`);
  assert.equal(row.slug, categorySlug(row.name), `row ${i} slug must be the url-safe category path for "${row.name}"`);
  assert.ok(knownNames.has(row.name), `row ${i} topic "${row.name}" is not a known category`);
  assert.ok(Number.isInteger(row.articles) && row.articles > 0, `row ${i} articles must be a positive integer`);
  assert.ok(
    row.url.startsWith(`${data.site}/wiki/category/`),
    `row ${i} url must be absolute and start with the envelope site (got ${row.url})`,
  );
  assert.equal(
    row.url,
    `${data.site}/wiki/category/${row.slug}/`,
    `row ${i} url must equal ${data.site}/wiki/category/${row.slug}/`,
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
    `${data.site}/wiki/category/${row.slug}/articles.json`,
    `row ${i} articlesUrl must equal ${data.site}/wiki/category/${row.slug}/articles.json`,
  );
  // articlesJsonUrl is the same article-list link under the consistent
  // <name>JsonUrl key every other JSON companion uses and the category page
  // envelope exposes; it must equal articlesUrl (kept for back-compat).
  assert.ok(
    row.articlesJsonUrl.startsWith(`${data.site}/wiki/category/`),
    `row ${i} articlesJsonUrl must be absolute and start with the envelope site (got ${row.articlesJsonUrl})`,
  );
  assert.equal(
    row.articlesJsonUrl,
    `${data.site}/wiki/category/${row.slug}/articles.json`,
    `row ${i} articlesJsonUrl must equal ${data.site}/wiki/category/${row.slug}/articles.json`,
  );
  assert.equal(row.articlesJsonUrl, row.articlesUrl, `row ${i} articlesJsonUrl must equal the back-compat articlesUrl`);
  // feedUrl points at the category's JSON Feed (/wiki/category/<slug>/feed.json),
  // so a feed-reader or programmatic consumer can subscribe to a category
  // straight from the index without reconstructing the route. Same absolute-URL
  // contract as url/articlesUrl.
  assert.ok(
    row.feedUrl.startsWith(`${data.site}/wiki/category/`),
    `row ${i} feedUrl must be absolute and start with the envelope site (got ${row.feedUrl})`,
  );
  assert.equal(
    row.feedUrl,
    `${data.site}/wiki/category/${row.slug}/feed.json`,
    `row ${i} feedUrl must equal ${data.site}/wiki/category/${row.slug}/feed.json`,
  );
  // feedJsonUrl is the same JSON Feed link under the consistent <name>JsonUrl
  // key every other JSON companion uses; it must equal feedUrl (kept for back-compat).
  assert.equal(
    row.feedJsonUrl,
    `${data.site}/wiki/category/${row.slug}/feed.json`,
    `row ${i} feedJsonUrl must equal ${data.site}/wiki/category/${row.slug}/feed.json`,
  );
  assert.equal(row.feedJsonUrl, row.feedUrl, `row ${i} feedJsonUrl must equal the back-compat feedUrl`);
  // atomUrl / rssUrl point at the category's Atom and RSS feeds
  // (/wiki/category/<slug>/atom.xml and /rss.xml), which exist alongside the
  // JSON feed. A feed reader that speaks Atom/RSS rather than JSON Feed needs
  // these to subscribe straight from the index. Same absolute-URL contract.
  assert.equal(
    row.atomUrl,
    `${data.site}/wiki/category/${row.slug}/atom.xml`,
    `row ${i} atomUrl must equal ${data.site}/wiki/category/${row.slug}/atom.xml`,
  );
  assert.equal(
    row.rssUrl,
    `${data.site}/wiki/category/${row.slug}/rss.xml`,
    `row ${i} rssUrl must equal ${data.site}/wiki/category/${row.slug}/rss.xml`,
  );
});

console.log(`Categories JSON check passed (${data.count} topics)`);
