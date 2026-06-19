import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedPages } from './most-linked.js';

// /wiki/special/mostlinkedpages.json exposes the inbound-link ranking as
// structured JSON for programmatic consumers. The contract is load-bearing: a
// malformed response, a wrong backlink count, a non-deterministic order, or a
// ranking that disagrees with the link graph / HTML page would silently break
// every downstream consumer. This check guards all of those:
//   1) Unit-tests buildMostLinkedPages with constructed inputs.
//   2) Verifies the tiebreak uses compareTitles (NOT raw string), matching the
//      HTML Special:MostLinkedPages page.
//   3) Re-derives the expected ranking from public/data/backlinks.json +
//      slugmap.json and asserts the built JSON matches it field-for-field.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---- 1) Unit: buildMostLinkedPages with constructed inputs ----------------
{
  const ranked = buildMostLinkedPages({
    backlinks: {
      a: [{ from: 'b' }, { from: 'c' }, { from: 'ghost' }], // ghost is unpublished -> not counted
      b: [{ from: 'a' }],
      c: [], // no inbound -> dropped
      ghost: [{ from: 'a' }], // not in titleBySlug -> dropped entirely
    },
    titleBySlug: { a: 'Alpha', b: 'Beta', c: 'Gamma' },
  });
  assert.deepEqual(
    ranked,
    [
      { slug: 'a', title: 'Alpha', count: 2 },
      { slug: 'b', title: 'Beta', count: 1 },
    ],
    'ranking must count only published inbound links, drop zero-inbound and unknown targets, and sort count-desc',
  );
}

// ---- 2) Tiebreak uses compareTitles (NOT raw string) ----------------------
//
// Same-count numeric-suffixed slugs must order numerically (subnet_9 before
// subnet_10), the SAME ordering the HTML page uses. Raw string comparison would
// put subnet_10 before subnet_9.
{
  const tied = buildMostLinkedPages({
    backlinks: {
      subnet_9: [{ from: 'x' }],
      subnet_10: [{ from: 'x' }],
      x: [],
    },
    titleBySlug: { subnet_9: 'Subnet 9', subnet_10: 'Subnet 10', x: 'X' },
  });
  assert.deepEqual(
    tied.map((e) => e.slug),
    ['subnet_9', 'subnet_10'],
    'tied numeric-suffixed entries must use compareTitles (Subnet 9 before Subnet 10), NOT raw string order',
  );
}

// ---- 3) Empty input edge case ---------------------------------------------
{
  assert.deepEqual(buildMostLinkedPages({ backlinks: {}, titleBySlug: {} }), [], 'empty input must yield an empty ranking');
  assert.deepEqual(buildMostLinkedPages({}), [], 'missing inputs must not crash');
}

// ---- 4) Built output: validate against the link graph ---------------------
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'mostlinkedpages.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/mostlinkedpages.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.ok(data.pages.length > 0, 'mostlinkedpages.json must list at least one ranked article');

// Re-derive the expected ranking from the link graph with the SAME builder.
const titleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) titleBySlug[slug] = entry.title;
const expected = buildMostLinkedPages({ backlinks, titleBySlug });

assert.equal(data.pages.length, expected.length, `mostlinkedpages.json must list all ${expected.length} ranked articles (got ${data.pages.length})`);
data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the link-graph ranking`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the article title for ${expected[i].slug}`);
  assert.equal(row.url, `/wiki/${expected[i].slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(row.backlinks, expected[i].count, `row ${i} backlinks count must match the link graph`);
  assert.ok(Number.isInteger(row.backlinks) && row.backlinks > 0, `row ${i} backlinks must be a positive integer`);
});
for (let i = 1; i < data.pages.length; i++) {
  assert.ok(data.pages[i - 1].backlinks >= data.pages[i].backlinks, `rows must be sorted by backlinks descending (row ${i - 1} >= row ${i})`);
}

console.log(`Most linked pages JSON check passed (${data.count} ranked articles, top=${data.pages[0].slug} with ${data.pages[0].backlinks} backlinks)`);
