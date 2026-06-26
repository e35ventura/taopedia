import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWantedPages, collectWantedRequesters, isWantedTarget } from './wanted-pages.js';

// titleBySlug = the published articles. linkGraph = each article's resolved
// outbound targets (build-linkgraph.js shape), where a target absent from
// titleBySlug is a red link / wanted page.
const titleBySlug = { a: 'A', b: 'B', c: 'C' };
const linkGraph = {
  a: [{ target: 'missing_x' }, { target: 'b' }, { target: 'missing_y' }],
  b: [{ target: 'missing_x' }, { target: 'missing_x' }, { target: 'c' }], // repeated target
  c: [{ target: 'missing_y' }, { target: 'c' }], // self-link 'c' is never wanted
  draft: [{ target: 'missing_x' }], // source not published -> must not count
};

// isWantedTarget: non-empty, unsatisfied by a published article, not a self-link.
assert.equal(isWantedTarget('missing_x', 'a', titleBySlug), true, 'unresolved target is wanted');
assert.equal(isWantedTarget('b', 'a', titleBySlug), false, 'published target is not wanted');
assert.equal(isWantedTarget('c', 'c', titleBySlug), false, 'self-link target is not wanted');
assert.equal(isWantedTarget('', 'a', titleBySlug), false, 'empty target is not wanted');

// collectWantedRequesters: distinct published requesters per wanted target; a
// repeated target counts a requester once; an unpublished source is ignored.
const requesters = collectWantedRequesters({ linkGraph, titleBySlug });
assert.deepEqual([...requesters.get('missing_x')].sort(), ['a', 'b'], 'missing_x wanted by a and b (draft ignored, dup counted once)');
assert.deepEqual([...requesters.get('missing_y')].sort(), ['a', 'c'], 'missing_y wanted by a and c');
assert.equal(requesters.has('b'), false, 'a published target never becomes a wanted page');
assert.equal(requesters.has('c'), false, 'a self-linked published target never becomes a wanted page');

// buildWantedPages: rank by distinct-requester count desc, then slug; each entry
// lists the requesting article slugs sorted.
const ranked = buildWantedPages({ linkGraph, titleBySlug });
assert.deepEqual(
  ranked,
  [
    { slug: 'missing_x', count: 2, requestedBy: ['a', 'b'] },
    { slug: 'missing_y', count: 2, requestedBy: ['a', 'c'] },
  ],
  'wanted pages ranked by distinct published requesters (count desc, then slug), excluding published targets, self-links, and unpublished sources',
);

// A graph with no red links yields no wanted pages.
assert.deepEqual(
  buildWantedPages({ linkGraph: { a: [{ target: 'b' }], b: [{ target: 'a' }] }, titleBySlug }),
  [],
  'no wanted pages when every target resolves to a published article',
);

// Same-count ties (and the requester lists) order by a PLAIN code-unit slug
// comparison — the site-wide listing convention (buildMostLinkedPages /
// getArticleReferences / search-data) — NOT compareTitles numeric collation. So a
// tied "subnet_10" sorts before "subnet_9" (raw '1' < '9'), the opposite of numeric
// collation, matching every other listing; likewise requester "from_10" before "from_9".
{
  const numericTitles = { from_10: 'From 10', from_9: 'From 9' };
  const numericGraph = {
    from_9: [{ target: 'subnet_9' }, { target: 'subnet_10' }],
    from_10: [{ target: 'subnet_9' }, { target: 'subnet_10' }],
  };
  assert.deepEqual(
    buildWantedPages({ linkGraph: numericGraph, titleBySlug: numericTitles }),
    [
      { slug: 'subnet_10', count: 2, requestedBy: ['from_10', 'from_9'] },
      { slug: 'subnet_9', count: 2, requestedBy: ['from_10', 'from_9'] },
    ],
    'tied wanted slugs and requester lists use plain code-unit order (subnet_10 before subnet_9, from_10 before from_9), matching site-wide listings',
  );
}

// ---- Built-output contract: validate the served endpoint --------------------
//
// The route's whole point is the machine-readable JSON, so re-derive the expected
// report from the same public/data/{linkgraph,slugmap}.json the build wrote and
// assert dist/wiki/special/wantedpages.json matches it field-for-field: a wrong
// envelope, a count/length mismatch, a published slug leaking in as "wanted", a
// non-deterministic order, or a malformed requester would silently break consumers.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'wantedpages.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/wantedpages.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.wantedpagesJsonUrl, `${data.site}/wiki/special/wantedpages.json`, 'wantedpagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');

const realTitleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) realTitleBySlug[slug] = entry.title;
const expected = buildWantedPages({ linkGraph: linkgraphData, titleBySlug: realTitleBySlug });

assert.equal(data.pages.length, expected.length, `wantedpages.json must list all ${expected.length} wanted pages (got ${data.pages.length})`);
data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the wanted-page ranking`);
  assert.equal(row.count, expected[i].count, `row ${i} count must match the distinct-requester count`);
  assert.ok(!realTitleBySlug[row.slug], `row ${i} (${row.slug}) must be an unpublished target (a real red link), not an existing article`);
  assert.ok(Array.isArray(row.requestedBy) && row.requestedBy.length === row.count, `row ${i} requestedBy must list exactly ${row.count} requesters`);
  assert.deepEqual(
    row.requestedBy.map((r) => r.slug),
    expected[i].requestedBy,
    `row ${i} requestedBy slugs must match the link graph`,
  );
  for (const req of row.requestedBy) {
    assert.ok(realTitleBySlug[req.slug], `requester ${req.slug} for ${row.slug} must be a published article`);
    assert.equal(req.title, realTitleBySlug[req.slug], `requester ${req.slug} title must match the slug map`);
    assert.equal(req.url, `${data.site}/wiki/${req.slug}/`, `requester ${req.slug} url must be the canonical article URL`);
  }
});

console.log(`Wanted pages check passed (${data.pages.length} wanted pages from the built endpoint match the link graph)`);
