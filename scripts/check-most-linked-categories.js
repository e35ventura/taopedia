import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedCategories } from './most-linked-categories.js';
import { categorySlug } from './categories.js';

// /wiki/special/mostlinkedcategories.json exposes the topic-usage ranking (the
// MediaWiki "Most used categories" report) as structured JSON for programmatic
// consumers. The contract is load-bearing: a wrong article count, a
// non-deterministic order, an empty topic leaking in, or a ranking that
// disagrees with the category index / the sibling Special:Categories endpoint
// would silently mislead editors and downstream tools. This check guards all of
// those:
//   1) Unit-tests buildMostLinkedCategories with constructed inputs.
//   2) Re-derives the expected ranking from public/data/categories.json and
//      asserts the built JSON matches it field-for-field, in count-desc order.
//   3) Cross-checks the ranking against the sibling dist categories.json so the
//      two surfaces can never disagree on which topics exist or how many
//      articles each has.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: ranking, distinct-member counts, empty-topic drop -------------
{
  const ranked = buildMostLinkedCategories({
    categoriesIndex: {
      Consensus: ['a', 'b', 'c'],
      Emissions: ['a', 'a', 'b'], // duplicate 'a' counts once -> 2 distinct members
      Weights: ['x'],
      Empty: [], // zero members -> dropped
      Broken: 'not-an-array', // non-array -> count 0 -> dropped
    },
  });
  assert.deepEqual(
    ranked,
    [
      { name: 'Consensus', slug: 'Consensus', count: 3 },
      { name: 'Emissions', slug: 'Emissions', count: 2 },
      { name: 'Weights', slug: 'Weights', count: 1 },
    ],
    'topics rank by DISTINCT tagged-article count (desc), dedupe repeated members, and drop empty/non-array topics',
  );
}

// ---- 1b) Same-count ties order by compareTitles(name), numerically ----------
//
// Two equally-used topics must order by the SAME numeric collation
// Special:Categories uses, so "Subnet 9" precedes "Subnet 10" (not code-unit
// order, which would invert them). Spaces in the name map to underscores in the
// slug (categorySlug).
{
  const tied = buildMostLinkedCategories({
    categoriesIndex: {
      'Subnet 10': ['a', 'b'],
      'Subnet 9': ['c', 'd'],
    },
  });
  assert.deepEqual(
    tied,
    [
      { name: 'Subnet 9', slug: 'Subnet_9', count: 2 },
      { name: 'Subnet 10', slug: 'Subnet_10', count: 2 },
    ],
    'tied topics order by compareTitles(name) numeric collation (Subnet 9 before Subnet 10), with spaces slugified to underscores',
  );
}

// ---- 1c) Empty / missing input never crashes -------------------------------
{
  assert.deepEqual(buildMostLinkedCategories({ categoriesIndex: {} }), [], 'an empty index yields an empty ranking');
  assert.deepEqual(buildMostLinkedCategories({}), [], 'a missing index yields an empty ranking');
  assert.deepEqual(buildMostLinkedCategories(), [], 'no arguments must not crash');
}

// ---- 2) Built output: validate the served endpoint --------------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'mostlinkedcategories.json');
const categoriesFile = path.join(projectRoot, 'public', 'data', 'categories.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/mostlinkedcategories.json not found; run the build first');
assert.ok(fs.existsSync(categoriesFile), 'public/data/categories.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const categoriesIndex = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(
  data.mostlinkedcategoriesJsonUrl,
  `${data.site}/wiki/special/mostlinkedcategories.json`,
  'mostlinkedcategoriesJsonUrl must be the canonical self-link',
);
assert.ok(Array.isArray(data.categories), 'categories must be an array');
assert.equal(data.count, data.categories.length, 'count must equal categories.length');
assert.ok(data.categories.length > 0, 'mostlinkedcategories.json must list at least one topic');

// Re-derive the expected ranking from the SAME category index the endpoint reads.
const expected = buildMostLinkedCategories({ categoriesIndex });
assert.equal(
  data.categories.length,
  expected.length,
  `mostlinkedcategories.json must list all ${expected.length} non-empty topics (got ${data.categories.length})`,
);

data.categories.forEach((row, i) => {
  assert.equal(row.name, expected[i].name, `row ${i} name must match the topic-usage ranking`);
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the topic-usage ranking`);
  assert.equal(row.slug, categorySlug(row.name), `row ${i} (${row.name}) slug must be the space->underscore category slug`);
  assert.equal(row.articles, expected[i].count, `row ${i} (${row.name}) articles count must match the category index`);
  assert.ok(Number.isInteger(row.articles) && row.articles > 0, `row ${i} (${row.name}) articles must be a positive integer`);

  // The article count must equal the DISTINCT published members the index lists
  // for this topic, and every member must be a real published article.
  const members = new Set(Array.isArray(categoriesIndex[row.name]) ? categoriesIndex[row.name] : []);
  assert.equal(members.size, row.articles, `row ${i} (${row.name}) articles must equal its distinct member count in the index`);
  for (const member of members) {
    assert.ok(slugmap[member], `row ${i} (${row.name}) member ${member} must be a published article`);
  }

  // Companion URLs must be absolute and match the canonical category hub routes.
  assert.equal(row.url, `${data.site}/wiki/category/${row.slug}/`, `row ${i} url must be the canonical category hub URL`);
  assert.equal(row.articlesUrl, `${data.site}/wiki/category/${row.slug}/articles.json`, `row ${i} articlesUrl must be the category article-list JSON URL`);
  assert.equal(row.articlesJsonUrl, row.articlesUrl, `row ${i} articlesJsonUrl must equal the back-compat articlesUrl`);
  assert.equal(row.feedUrl, `${data.site}/wiki/category/${row.slug}/feed.json`, `row ${i} feedUrl must be the category JSON Feed URL`);
  assert.equal(row.feedJsonUrl, row.feedUrl, `row ${i} feedJsonUrl must equal the back-compat feedUrl`);
  assert.equal(row.atomUrl, `${data.site}/wiki/category/${row.slug}/atom.xml`, `row ${i} atomUrl must be the category Atom feed URL`);
  assert.equal(row.rssUrl, `${data.site}/wiki/category/${row.slug}/rss.xml`, `row ${i} rssUrl must be the category RSS feed URL`);
});

// Coverage: every non-empty topic in the index appears exactly once, so the
// ranking is neither over- nor under-inclusive.
const nonEmptyTopics = Object.entries(categoriesIndex).filter(
  ([, slugs]) => (Array.isArray(slugs) ? new Set(slugs).size : 0) > 0,
).length;
assert.equal(
  data.categories.length,
  nonEmptyTopics,
  `every non-empty topic must appear exactly once (index has ${nonEmptyTopics} non-empty topics, ranking has ${data.categories.length})`,
);

// Order: strictly non-increasing by article count.
for (let i = 1; i < data.categories.length; i++) {
  assert.ok(
    data.categories[i - 1].articles >= data.categories[i].articles,
    `rows must be sorted by articles descending (row ${i - 1} >= row ${i})`,
  );
}

// ---- 3) Cross-check the sibling Special:Categories endpoint ------------------
//
// categories.json lists the SAME topics in alphabetical order. The two surfaces
// derive from one category index, so they must agree on which topics exist and
// how many articles each has — only the ordering differs.
const categoriesDistFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'categories.json');
if (fs.existsSync(categoriesDistFile)) {
  const siblingCategories = JSON.parse(fs.readFileSync(categoriesDistFile, 'utf8'));
  assert.equal(
    data.categories.length,
    siblingCategories.categories.length,
    `mostlinkedcategories.json (${data.categories.length}) and categories.json (${siblingCategories.categories.length}) must list the same number of topics`,
  );
  const siblingArticlesBySlug = new Map(siblingCategories.categories.map((topic) => [topic.slug, topic.articles]));
  for (const row of data.categories) {
    assert.ok(siblingArticlesBySlug.has(row.slug), `topic ${row.slug} must also appear in the sibling categories.json`);
    assert.equal(
      row.articles,
      siblingArticlesBySlug.get(row.slug),
      `topic ${row.slug} articles count must agree with the sibling categories.json`,
    );
  }
}

console.log(
  `Most linked categories JSON check passed (${data.count} topics from the built endpoint match the category index; top=${data.categories[0].slug} with ${data.categories[0].articles} articles)`,
);
