import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-output check for the per-category JSON Feed endpoint
// (src/pages/wiki/category/[category]/feed.json.ts). The discovery check
// (check-category-feed-discovery.js) only asserts the category page <head>
// *advertises* /feed.json; it cannot tell whether the generated feed itself is
// well-formed or actually scoped to the category. This walks each built
// dist/wiki/category/<_>/feed.json, parses it, and verifies the JSON Feed 1.1
// envelope, that every item belongs to the category (and none are missing), that
// each item URL is the canonical article route, and that items carry a valid
// last-modified date — so a regression that broke routing, category filtering,
// URL derivation, or date wiring fails the build.

const ORIGIN = 'https://taopedia.org';
const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const categoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');

assert.ok(fs.existsSync(categoryDir), 'dist/wiki/category not found; run the build first');

// Category membership source of truth: public/data/categories.json maps each
// original category label to its member article slugs (built by
// build-linkgraph.js from the same content collection the feed reads).
const categoriesJsonPath = path.join(projectRoot, 'public', 'data', 'categories.json');
assert.ok(fs.existsSync(categoriesJsonPath), 'public/data/categories.json not found; run the build first');
const categoriesIndex = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));

// The feed route slugifies category labels with the same space-to-underscore
// transform as the endpoint, so map each built directory back to the original
// label used as the categories.json key.
const dirToOriginal = new Map();
for (const name of Object.keys(categoriesIndex)) {
  dirToOriginal.set(name.replace(/ /g, '_'), name);
}

const categories = fs
  .readdirSync(categoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

assert.ok(categories.length > 0, 'no built category pages found');

const canonicalArticleUrl = (url) => typeof url === 'string' && /^https:\/\/taopedia\.org\/wiki\/[^/]+\/$/.test(url);
const slugFromUrl = (url) => url.slice('/wiki/'.length, url.length - 1); // strip leading /wiki/ and trailing /
const isValidIsoDate = (value) => {
  if (typeof value !== 'string' || !value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

let checkedCategories = 0;
let checkedItems = 0;

for (const category of categories) {
  const feedPath = path.join(categoryDir, category, 'feed.json');
  assert.ok(fs.existsSync(feedPath), `missing built category feed: ${category}/feed.json`);

  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  const originalName = dirToOriginal.get(category);
  assert.ok(originalName, `${category}: built category directory must correspond to a known category label`);

  // JSON Feed 1.1 envelope, with feed_url/home_page_url pointing at this
  // category's own endpoint and hub (not the site-wide feed).
  assert.equal(feed.version, JSON_FEED_VERSION, `${category}: feed version must be JSON Feed 1.1`);
  assert.equal(
    feed.feed_url,
    `${ORIGIN}/wiki/category/${category}/feed.json`,
    `${category}: feed_url must be the canonical category feed URL`,
  );
  assert.equal(
    feed.home_page_url,
    `${ORIGIN}/wiki/category/${category}/`,
    `${category}: home_page_url must point at the category hub`,
  );
  assert.equal(feed.title, `Taopedia - ${originalName} articles`, `${category}: feed title must name the category`);
  assert.ok(
    Array.isArray(feed.items) && feed.items.length > 0,
    `${category}: category feed must contain at least one article`,
  );

  // Membership: every published member of this category must be in the feed, and
  // every feed item must belong to the category (no leakage from other topics).
  const members = new Set(categoriesIndex[originalName]);
  const feedSlugs = new Set();

  for (const item of feed.items) {
    assert.ok(
      canonicalArticleUrl(item.url),
      `${category}: item url must be a canonical trailing-slash article URL, got ${item.url}`,
    );

    const slug = slugFromUrl(new URL(item.url).pathname);
    assert.ok(
      members.has(slug),
      `${category}: item ${slug} appears in the feed but is not a member of this category`,
    );
    assert.ok(!feedSlugs.has(slug), `${category}: item ${slug} appears more than once in the feed`);
    feedSlugs.add(slug);

    // Every published article carries revision history, so each item must expose
    // a valid ISO-8601 last-modified date (the signal a feed reader sorts on).
    assert.ok(
      isValidIsoDate(item.date_modified),
      `${category}: item ${slug} must carry a valid date_modified (ISO 8601)`,
    );
    checkedItems += 1;
  }

  // Completeness: no member is silently dropped from its category feed.
  const missing = [...members].filter((slug) => !feedSlugs.has(slug));
  assert.deepEqual(
    missing,
    [],
    `${category}: feed is missing ${missing.length} member article(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`,
  );

  checkedCategories += 1;
}

console.log(`Category JSON Feed check passed (${checkedCategories} categories, ${checkedItems} items)`);
