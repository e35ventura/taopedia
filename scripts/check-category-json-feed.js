import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategoryArticles } from './category-articles.js';

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

// ---- 1) Unit: buildCategoryArticles with constructed inputs ---------------
{
  const pages = [
    { id: 'a/index.mdx', data: { title: 'Apex', summary: 'apex', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Bravo', summary: 'bravo', categories: ['Wallets'] } },
    { id: 'c/index.mdx', data: { title: 'Charlie', summary: '', categories: ['Subnets', 'Consensus'] } },
  ];
  const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');

  const subnets = buildCategoryArticles({ pages, categoryName: 'Subnets', getPageSlug });
  assert.equal(subnets.length, 2, 'Subnets should include Apex and Charlie');
  assert.equal(subnets[0].slug, 'a', 'title sort: Apex first');
  assert.equal(subnets[1].slug, 'c', 'title sort: Charlie second');
  assert.equal(subnets[0].url, '/wiki/a/', 'url uses the canonical /wiki/<slug>/ form');
  assert.equal(subnets[1].summary, '', 'empty summary is preserved');

  const wallets = buildCategoryArticles({ pages, categoryName: 'Wallets', getPageSlug });
  assert.equal(wallets.length, 1, 'Wallets should include Bravo only');
  assert.equal(wallets[0].slug, 'b', 'Bravo belongs to Wallets');
}

{
  const pages = [
    { id: 'c/index.mdx', data: { title: 'Subnet 10', summary: '', categories: ['Subnets'] } },
    { id: 'a/index.mdx', data: { title: 'Subnet 2', summary: '', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Subnet 9', summary: '', categories: ['Subnets'] } },
  ];
  const out = buildCategoryArticles({
    pages,
    categoryName: 'Subnets',
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.deepEqual(
    out.map((article) => article.title),
    ['Subnet 2', 'Subnet 9', 'Subnet 10'],
    'numeric-suffixed titles must order numerically',
  );
}

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
let checkedArticleLists = 0;

for (const category of categories) {
  const feedPath = path.join(categoryDir, category, 'feed.json');
  const articlesPath = path.join(categoryDir, category, 'articles.json');
  assert.ok(fs.existsSync(feedPath), `missing built category feed: ${category}/feed.json`);
  assert.ok(fs.existsSync(articlesPath), `missing built category membership endpoint: ${category}/articles.json`);

  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  const articlesDoc = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
  const htmlPath = path.join(categoryDir, category, 'index.html');
  assert.ok(fs.existsSync(htmlPath), `missing built category hub: ${category}/index.html`);
  const html = fs.readFileSync(htmlPath, 'utf8');
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

  assert.equal(articlesDoc.site, ORIGIN, `${category}: articles.json site must be ${ORIGIN}`);
  assert.equal(articlesDoc.category, originalName, `${category}: articles.json category must match the original category name`);
  assert.equal(
    articlesDoc.url,
    `${ORIGIN}/wiki/category/${category}/`,
    `${category}: articles.json url must be the canonical category URL`,
  );
  assert.ok(Array.isArray(articlesDoc.articles), `${category}: articles.json articles must be an array`);
  assert.equal(articlesDoc.count, articlesDoc.articles.length, `${category}: articles.json count must equal articles.length`);
  assert.ok(articlesDoc.articles.length > 0, `${category}: articles.json must contain at least one article`);

  // Membership: every published member of this category must be in the feed, and
  // every feed item must belong to the category (no leakage from other topics).
  const members = new Set(categoriesIndex[originalName]);
  const feedSlugs = new Set();
  const orderedFeedSlugs = [];

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
    orderedFeedSlugs.push(slug);

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

  // articles.json must expose the same category membership as the feed and the
  // HTML hub, with the same order the HTML hub renders.
  const orderedJsonSlugs = [];
  for (const [index, article] of articlesDoc.articles.entries()) {
    assert.ok(typeof article.slug === 'string' && article.slug.length > 0, `${category}: articles.json row ${index} slug must be a non-empty string`);
    assert.ok(typeof article.title === 'string' && article.title.length > 0, `${category}: articles.json row ${index} title must be a non-empty string`);
    assert.equal(
      article.url,
      `${ORIGIN}/wiki/${article.slug}/`,
      `${category}: articles.json row ${index} url must be the canonical article URL`,
    );
    orderedJsonSlugs.push(article.slug);
  }
  assert.deepEqual(
    new Set(orderedJsonSlugs),
    feedSlugs,
    `${category}: articles.json membership must match the per-category feed membership`,
  );

  const categoryBlock = html.match(/<div class="category-pages"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(categoryBlock, `${category}: HTML hub must contain the .category-pages block`);
  const orderedHtmlSlugs = [...categoryBlock[1].matchAll(/<a href="\/wiki\/([^/]+)\/" class="card-link"/g)].map(
    (match) => match[1],
  );
  assert.equal(
    orderedHtmlSlugs.length,
    articlesDoc.articles.length,
    `${category}: HTML hub and articles.json must list the same number of articles`,
  );
  assert.deepEqual(
    orderedJsonSlugs,
    orderedHtmlSlugs,
    `${category}: articles.json order must match the HTML hub order exactly`,
  );

  checkedCategories += 1;
  checkedArticleLists += 1;
}

assert.ok(checkedArticleLists > 0, 'no category article-list endpoints were verified');

console.log(
  `Category JSON Feed check passed (${checkedCategories} categories, ${checkedItems} feed items, ${checkedArticleLists} articles.json endpoints with exact HTML-order parity)`,
);
