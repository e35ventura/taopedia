import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategoryArticles } from './category-articles.js';

// /wiki/category/<name>.articles.json exposes the per-topic article membership
// as structured JSON, mirroring the HTML category hub page for programmatic
// consumers (alongside the per-special and per-article JSON endpoints). The
// contract is load-bearing: a malformed response, a wrong article, a missing
// category, a non-deterministic order, or a list that disagrees with the HTML
// page or the per-category feed would silently break every downstream consumer.
// This validates all of those against the REAL content collection, the built
// HTML hub page, and the rendered per-category JSON feed (which is a separate
// surface that also enumerates this category's membership, so the three
// surfaces — HTML hub, JSON feed, JSON membership — must always agree).
//
//   1) Unit-tests buildCategoryArticles with constructed inputs (catches
//      builder regressions before the site is rendered).
//   2) Verifies the sort uses sortPagesByTitle (NOT raw string) so the JSON
//      and HTML surfaces never disagree on article order.
//   3) For every built per-category JSON file, asserts the membership matches
//      the rendered HTML hub page and the per-category JSON feed.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildCategoryArticles with constructed inputs ----------------
{
  const pages = [
    { id: 'a/index.mdx', data: { title: 'Apex', summary: 'apex', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Bravo', summary: 'bravo', categories: ['Wallets'] } },
    { id: 'c/index.mdx', data: { title: 'Charlie', summary: '', categories: ['Subnets', 'Consensus'] } },
  ];
  const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');

  const subnets = buildCategoryArticles({ pages, categoryName: 'Subnets', getPageSlug });
  assert.equal(subnets.length, 2, 'Subnets has Apex + Charlie');
  assert.equal(subnets[0].slug, 'a', 'title sort: Apex first');
  assert.equal(subnets[1].slug, 'c', 'title sort: Charlie second');
  assert.equal(subnets[0].url, '/wiki/a/', 'url is the canonical /wiki/<slug>/ form');
  assert.equal(subnets[1].summary, '', 'empty summary preserved as empty string');

  const wallets = buildCategoryArticles({ pages, categoryName: 'Wallets', getPageSlug });
  assert.equal(wallets.length, 1, 'Wallets has Bravo only');
  assert.equal(wallets[0].slug, 'b', 'Bravo in Wallets');
}

// Numeric title sort: "Subnet 9" before "Subnet 10" (numeric, not raw string).
{
  const pages = [
    { id: 'c/index.mdx', data: { title: 'Subnet 10', summary: '', categories: ['Subnets'] } },
    { id: 'a/index.mdx', data: { title: 'Subnet 2', summary: '', categories: ['Subnets'] } },
    { id: 'b/index.mdx', data: { title: 'Subnet 9', summary: '', categories: ['Subnets'] } },
  ];
  const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');
  const out = buildCategoryArticles({ pages, categoryName: 'Subnets', getPageSlug });
  assert.deepEqual(
    out.map((a) => a.title),
    ['Subnet 2', 'Subnet 9', 'Subnet 10'],
    'numeric-suffixed titles must order numerically (Subnet 2 < Subnet 9 < Subnet 10), not by raw string',
  );
}

// Articles without the category must NOT appear in the list.
{
  const pages = [
    { id: 'a/index.mdx', data: { title: 'Apex', summary: '', categories: ['Wallets'] } },
    { id: 'b/index.mdx', data: { title: 'Bravo', summary: '', categories: [] } },
    { id: 'c/index.mdx', data: { title: 'Charlie', summary: '', categories: ['Subnets'] } },
  ];
  const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');
  const out = buildCategoryArticles({ pages, categoryName: 'Subnets', getPageSlug });
  assert.equal(out.length, 1, 'only Charlie is tagged Subnets');
  assert.equal(out[0].slug, 'c', 'Charlie is the only Subnets member');
}

// Unknown / empty category returns an empty list without crashing.
{
  const out = buildCategoryArticles({
    pages: [{ id: 'a/index.mdx', data: { title: 'Apex', categories: ['Subnets'] } }],
    categoryName: 'Nonexistent',
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.deepEqual(out, [], 'unknown category yields an empty list');
}

{
  assert.deepEqual(
    buildCategoryArticles({ pages: [], categoryName: 'Subnets', getPageSlug: () => '' }),
    [],
    'empty pages yields an empty list',
  );
}

// Missing fields normalize to safe defaults.
{
  const out = buildCategoryArticles({
    pages: [{ id: 'x/index.mdx', data: { title: 'X', categories: ['Subnets'] } }],
    categoryName: 'Subnets',
    getPageSlug: (page) => page.id.replace(/\/index\.mdx$/, ''),
  });
  assert.equal(out[0].summary, '', 'undefined summary normalizes to empty string');
}

// ---- 2) Built output: validate every per-category JSON file against the
//         rendered HTML hub page and the per-category JSON feed --------------

const distCategoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');
assert.ok(
  fs.existsSync(distCategoryDir),
  'dist/wiki/category not found; run the build first',
);

let verifiedCount = 0;
let verifiedHtmlParity = 0;
for (const entry of fs.readdirSync(distCategoryDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const slug = entry.name;
  const jsonFile = path.join(distCategoryDir, slug, 'articles.json');
  const htmlFile = path.join(distCategoryDir, slug, 'index.html');
  const feedFile = path.join(distCategoryDir, slug, 'feed.json');
  if (!fs.existsSync(jsonFile)) continue; // skip categories that have no articles.json

  assert.ok(fs.existsSync(htmlFile), `category ${slug}: HTML hub page is missing for a built articles.json`);
  assert.ok(fs.existsSync(feedFile), `category ${slug}: per-category JSON feed is missing for a built articles.json`);

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const html = fs.readFileSync(htmlFile, 'utf8');
  const feed = JSON.parse(fs.readFileSync(feedFile, 'utf8'));

  // site + envelope.
  assert.ok(
    typeof data.site === 'string' && /^https?:\/\//.test(data.site),
    `${slug}: site must be a URL string (got ${JSON.stringify(data.site)})`,
  );
  assert.equal(typeof data.category, 'string', `${slug}: category must be a string`);
  assert.ok(data.category.length > 0, `${slug}: category must be a non-empty string`);
  assert.equal(
    data.url,
    `${data.site}/wiki/category/${slug}/`,
    `${slug}: url must be the canonical /wiki/category/${slug}/ URL`,
  );
  assert.ok(
    typeof data.count === 'number' && Number.isFinite(data.count) && data.count >= 0,
    `${slug}: count must be a non-negative finite number (got ${JSON.stringify(data.count)})`,
  );
  assert.equal(data.count, data.articles.length, `${slug}: count must equal articles.length`);
  assert.ok(Array.isArray(data.articles), `${slug}: articles must be an array`);

  // Re-derive the expected membership from the rendered HTML page's article
  // links (the same set the hub renders). The hub also includes the topic
  // chip in the breadcrumb; exclude those.
  const linkRegex = /href="(\/wiki\/[^/]+\/)"/g;
  const slugsFromHtml = new Set();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.includes('/wiki/category/') || href.includes('/wiki/special/')) continue;
    const articleSlug = href.split('/')[2];
    if (articleSlug) slugsFromHtml.add(articleSlug);
  }
  assert.ok(slugsFromHtml.size > 0, `${slug}: HTML hub page must list at least one article link`);
  assert.equal(
    data.articles.length,
    slugsFromHtml.size,
    `${slug}: articles.json must list every article the HTML hub lists (${slugsFromHtml.size} slugs in HTML; got ${data.articles.length} rows in JSON)`,
  );

  const jsonSlugs = new Set();
  data.articles.forEach((row, i) => {
    assert.ok(typeof row.slug === 'string' && row.slug.length > 0, `${slug}: row ${i} slug must be a non-empty string`);
    assert.ok(typeof row.title === 'string' && row.title.length > 0, `${slug}: row ${i} title must be a non-empty string`);
    assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `${slug}: row ${i} url must be the canonical /wiki/<slug>/ form`);
    assert.ok(
      fs.existsSync(path.join(projectRoot, 'dist', 'wiki', row.slug, 'index.html')),
      `${slug}: row ${i} links to an unbuilt article /wiki/${row.slug}/`,
    );
    jsonSlugs.add(row.slug);
  });

  // Every slug in the HTML page must also appear in the JSON.
  for (const slugInHtml of slugsFromHtml) {
    assert.ok(jsonSlugs.has(slugInHtml), `${slug}: slug ${slugInHtml} rendered in HTML must also appear in articles.json`);
  }

  // Per-category JSON feed membership parity: every article listed in the
  // feed's items must also appear in articles.json (same category membership).
  assert.ok(Array.isArray(feed.items), `${slug}: per-category JSON feed must have items`);
  assert.equal(
    feed.items.length,
    data.articles.length,
    `${slug}: per-category JSON feed (${feed.items.length} items) and articles.json (${data.articles.length} rows) must agree on category membership`,
  );
  for (const item of feed.items) {
    const itemSlugMatch = item.url?.match(/\/wiki\/([^/]+)\/$/);
    const itemSlug = itemSlugMatch?.[1];
    assert.ok(itemSlug, `${slug}: feed item ${item.url} must be a /wiki/<slug>/ URL`);
    assert.ok(
      jsonSlugs.has(itemSlug),
      `${slug}: feed item ${itemSlug} must also appear in articles.json`,
    );
  }
  verifiedHtmlParity += 1;
  verifiedCount += 1;
}

assert.ok(verifiedCount > 0, 'no per-category articles.json files were found in dist/wiki/category');
assert.ok(verifiedHtmlParity > 0, 'expected at least one category whose HTML/feed/membership surfaces were all verified');

console.log(
  `Category articles JSON check passed (${verifiedCount} categories verified; HTML hub + JSON feed + JSON membership surfaces agree on every category)`,
);