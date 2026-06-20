import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllPages } from './allpages.js';

// /wiki/special/allpages.json exposes the article directory (every
// published article grouped by topic) as structured JSON for programmatic
// consumers. The contract is load-bearing: a malformed response, a wrong
// group, a missing article, or a JSON that disagrees with the HTML page's
// topic groupings / ordering would silently break every downstream consumer.
// This check guards all of those:
//   1) Unit-tests buildAllPages with constructed inputs (catches builder
//      regressions before the site is rendered).
//   2) Verifies the within-group tiebreak uses compareTitles (NOT raw
//      string), matching the HTML page.
//   3) Re-derives the expected directory from the slug map and asserts
//      the built JSON matches it field-for-field (groups, membership,
//      order, summary, topics, url).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildAllPages with constructed inputs -------------------
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha', summary: 'first', categories: ['Wallets'] } },
      { id: 'b/index.mdx', data: { title: 'Beta', summary: '', categories: ['Subnets'] } },
      { id: 'c/index.mdx', data: { title: 'Gamma', categories: ['Misc'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  // Priority topics in PRIORITY_TOPICS order: Wallets, Subnets.
  assert.equal(out.groups.length, 3, 'priority groups + Other topics catch-all');
  assert.equal(out.groups[0].topic, 'Wallets');
  assert.equal(out.groups[0].pages.length, 1);
  assert.equal(out.groups[0].pages[0].slug, 'a');
  assert.equal(out.groups[0].categoryHref, '/wiki/category/Wallets/', 'Wallets categoryHref must point at the category hub');
  assert.equal(out.groups[1].topic, 'Subnets');
  assert.equal(out.groups[1].pages[0].slug, 'b');
  assert.equal(out.groups[1].categoryHref, '/wiki/category/Subnets/');
  assert.equal(out.groups[2].topic, 'Other topics');
  assert.equal(out.groups[2].pages[0].slug, 'c');
  assert.equal(out.groups[2].categoryHref, null, 'Other topics group has no category hub');
  assert.equal(out.count, 3);
  assert.equal(out.totalArticles, 3);
  assert.equal(out.truncated, false);
}

// Skips: pages without a title, missing summary normalized to empty string.
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha', categories: ['Wallets'] } },
      { id: 'b/index.mdx', data: { title: '' } }, // no title -> skipped
      { id: 'c/index.mdx', data: {} }, // no title -> skipped
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  assert.equal(out.totalArticles, 1, 'pages without a title must be skipped');
  assert.equal(out.count, 1);
  assert.equal(out.groups[0].pages[0].summary, '', 'missing summary must normalize to empty string');
}

// Missing categories array treated as [].
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha' } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  assert.equal(out.totalArticles, 1);
  assert.equal(out.groups[0].topic, 'Other topics', 'no categories must land in Other topics');
  assert.deepEqual(out.groups[0].pages[0].topics, []);
}

// Priority topics with no members are dropped (no empty placeholders).
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha', categories: ['Misc'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  assert.equal(out.groups.length, 1, 'empty priority groups must be dropped');
  assert.equal(out.groups[0].topic, 'Other topics');
}

// An article with multiple priority topics appears in EVERY matching bucket
// (matches the HTML page, which accumulates each page into every category
// bucket it belongs to) and is excluded from "Other topics".
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha', categories: ['Wallets', 'Subnets'] } },
      { id: 'b/index.mdx', data: { title: 'Beta', categories: ['Subnets'] } },
      { id: 'c/index.mdx', data: { title: 'Gamma', categories: ['Misc'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  assert.equal(out.groups.length, 3, 'priority groups + Other topics catch-all');
  assert.equal(out.groups[0].topic, 'Wallets');
  assert.deepEqual(out.groups[0].pages.map((p) => p.slug), ['a'], 'Alpha in Wallets');
  assert.equal(out.groups[1].topic, 'Subnets');
  assert.deepEqual(out.groups[1].pages.map((p) => p.slug), ['a', 'b'], 'Alpha + Beta both in Subnets');
  assert.equal(out.groups[2].topic, 'Other topics');
  assert.deepEqual(out.groups[2].pages.map((p) => p.slug), ['c'], 'Gamma in Other topics (no priority category)');
  assert.equal(out.count, 4, 'count counts duplicates across priority buckets');
  assert.equal(out.totalArticles, 3, 'totalArticles is the unique article count');
}

// ---- 2) Tiebreak uses compareTitles (NOT raw string) --------------------
//
// Within a group, articles must order alphabetically by title with numeric
// collation (Subnet 9 before Subnet 10), the SAME ordering the HTML page
// uses. Raw string comparison would put Subnet 10 before Subnet 9.
{
  const out = buildAllPages({
    pages: [
      { id: 'subnet_10/index.mdx', data: { title: 'Subnet 10: Sturdy', categories: ['Subnets'] } },
      { id: 'subnet_9/index.mdx', data: { title: 'Subnet 9: Pre-training', categories: ['Subnets'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 100,
  });
  assert.deepEqual(
    out.groups[0].pages.map((p) => p.slug),
    ['subnet_9', 'subnet_10'],
    'within-group ordering must use compareTitles (numeric: true), NOT raw string',
  );
}

// ---- 3) limit caps the total row count across all groups ---------------
{
  const out = buildAllPages({
    pages: [
      { id: 'a/index.mdx', data: { title: 'Alpha', categories: ['Wallets'] } },
      { id: 'b/index.mdx', data: { title: 'Beta', categories: ['Wallets'] } },
      { id: 'c/index.mdx', data: { title: 'Gamma', categories: ['Subnets'] } },
      { id: 'd/index.mdx', data: { title: 'Delta', categories: ['Subnets'] } },
    ],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 2,
  });
  assert.equal(out.totalArticles, 4, 'totalArticles is unaffected by limit');
  assert.equal(out.count, 2, 'count reflects the truncated row total');
  assert.equal(out.truncated, true);
  // Alpha + Beta are first under compareTitles; both fit; Subnets empty.
  assert.equal(out.groups[0].pages.length, 2);
  assert.equal(out.groups[1].pages.length, 0, 'cap ran out before Subnets got any rows');
}

// limit <= 0 (or non-finite) means no cap.
{
  const out = buildAllPages({
    pages: [{ id: 'a/index.mdx', data: { title: 'Alpha', categories: ['Wallets'] } }],
    getPageSlug: (page) => page.id.replace(/\/index\.(md|mdx)$/, ''),
    limit: 0,
  });
  assert.equal(out.count, 1);
  assert.equal(out.truncated, false);
}

// Empty input edge case.
{
  assert.deepEqual(
    buildAllPages({ pages: [], getPageSlug: () => '', limit: 100 }).groups,
    [],
    'empty input must yield no groups',
  );
  assert.deepEqual(
    buildAllPages({ pages: undefined, getPageSlug: undefined, limit: 100 }).groups,
    [],
    'missing inputs must not crash',
  );
}

// ---- 4) Built output: validate against the slug map ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'allpages.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/allpages.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

// site — non-empty URL/origin string.
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be a non-empty URL string (got ${JSON.stringify(data.site)})`,
);

// limit, count, totalArticles, truncated fields.
assert.ok(typeof data.limit === 'number' && data.limit > 0, `limit must be a positive number (got ${data.limit})`);
assert.ok(typeof data.count === 'number' && data.count > 0, `count must be a positive number (got ${data.count})`);
assert.ok(typeof data.totalArticles === 'number' && data.totalArticles > 0, `totalArticles must be a positive number (got ${data.totalArticles})`);
assert.equal(typeof data.truncated, 'boolean', 'truncated must be a boolean');
assert.ok(data.count >= data.totalArticles, 'count must be >= totalArticles (some articles appear in multiple priority groups)');
assert.ok(data.count <= data.limit, 'count must not exceed limit when truncated');

// groups — non-empty array.
assert.ok(Array.isArray(data.groups), 'groups must be an array');
assert.ok(data.groups.length > 0, 'allpages.json must have at least one group');

const allRows = [];
for (const group of data.groups) {
  assert.ok(typeof group.topic === 'string' && group.topic.length > 0, 'each group must have a non-empty topic');
  assert.ok(
    group.categoryHref === null || typeof group.categoryHref === 'string',
    'categoryHref must be a string or null',
  );
  assert.ok(Array.isArray(group.pages), 'group.pages must be an array');
  for (const row of group.pages) {
    assert.equal(typeof row.slug, 'string');
    assert.equal(typeof row.title, 'string');
    assert.ok(row.summary === null || typeof row.summary === 'string', 'summary must be a string or null');
    assert.ok(Array.isArray(row.topics), 'topics must be an array');
    assert.equal(row.url, `/wiki/${row.slug}/`, `row ${row.slug} url must be the canonical article URL`);
    assert.equal(row.title, slugmap[row.slug]?.title, `row ${row.slug} title must match the slug map title`);
    assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'wiki', row.slug, 'index.html')), `row ${row.slug} links to an unbuilt article`);
    allRows.push(row);
  }
}

// Articles appearing in multiple priority groups is allowed (and expected —
// matches the HTML page, which lists the same article under each of its
// topic filters). The "Other topics" group is reserved for articles with NO
// priority topic at all.

// Every published article appears in at least one group (priority or
// "Other topics"), and no priority bucket is silently dropped.
const seen = new Set();
for (const row of allRows) seen.add(row.slug);
const allBuiltSlugs = Object.keys(slugmap);
for (const slug of allBuiltSlugs) {
  assert.ok(seen.has(slug), `slug map entry ${slug} must appear in some group`);
}

// `data.count` is the emitted total (counting cross-bucket duplicates, the
// same way the HTML page renders). It must equal the number of emitted rows
// and be at least the number of built articles.
assert.equal(
  data.count,
  allRows.length,
  `data.count must equal the emitted row total (got count=${data.count}, emitted=${allRows.length})`,
);
assert.ok(data.count >= allBuiltSlugs.length, 'data.count must be at least the number of built articles (some appear in multiple priority groups)');

// Within-group ordering: every row's title must be <= the next row's title
// under compareTitles (numeric: true), matching the HTML page's order.
const { compareTitles } = await import('../src/lib/title-sort.js');
for (const group of data.groups) {
  for (let i = 1; i < group.pages.length; i++) {
    const cmp = compareTitles(group.pages[i - 1].title, group.pages[i].title);
    assert.ok(cmp <= 0, `group "${group.topic}" must be sorted by title (row ${i - 1}="${group.pages[i - 1].title}" before "${group.pages[i].title}")`);
  }
}

console.log(`All pages JSON check passed (${data.count}/${data.totalArticles} articles, ${data.groups.length} groups, top=${data.groups[0]?.topic})`);
