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
// Every per-page url must be absolute and match the envelope site field, the
// same self-contained contract the merged allpages.json fix (#580) established
// for the per-article directory: a programmatic consumer should never need to
// combine a relative url with the envelope site to reach the article.
for (const row of data.pages) {
  assert.ok(
    row.url.startsWith(`${data.site}/wiki/`),
    `row ${row.slug} url must be absolute and start with the envelope site (got ${row.url})`,
  );
  assert.equal(
    row.url,
    `${data.site}/wiki/${row.slug}/`,
    `row ${row.slug} url must equal ${data.site}/wiki/${row.slug}/`,
  );
}
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
  assert.equal(row.backlinks, expected[i].count, `row ${i} backlinks count must match the link graph`);
  assert.ok(Number.isInteger(row.backlinks) && row.backlinks > 0, `row ${i} backlinks must be a positive integer`);
  // infoUrl points at the article's Page-information page, the same companion
  // exposed elsewhere, so a consumer of the ranking can reach each top page's
  // metadata overview without rebuilding the route.
  assert.equal(
    row.infoUrl,
    `${data.site}/wiki/${row.slug}/info/`,
    `row ${i} infoUrl must equal ${data.site}/wiki/${row.slug}/info/`,
  );
  // historyUrl points at the article's revision-history page — the same
  // companion subnets.json / recentchanges.json expose — so a consumer of the
  // ranking can reach each top page's edit history without rebuilding the route.
  assert.ok(
    row.historyUrl.startsWith(`${data.site}/wiki/`),
    `row ${i} historyUrl must be absolute and start with the envelope site (got ${row.historyUrl})`,
  );
  assert.equal(
    row.historyUrl,
    `${data.site}/wiki/${row.slug}/history/`,
    `row ${i} historyUrl must equal ${data.site}/wiki/${row.slug}/history/`,
  );
  // historyJsonUrl is the JSON companion of historyUrl — the same HTML+JSON
  // pairing the entry exposes for backlinks (backlinksUrl + backlinksJsonUrl)
  // and that recentchanges.json exposes for history. /wiki/<slug>/history.json
  // exists, so a consumer can fetch a top page's machine-readable history.
  assert.equal(
    row.historyJsonUrl,
    `${data.site}/wiki/${row.slug}/history.json`,
    `row ${i} historyJsonUrl must equal ${data.site}/wiki/${row.slug}/history.json`,
  );
  assert.ok(
    row.backlinksUrl.startsWith(`${data.site}/wiki/`),
    `row ${i} backlinksUrl must be absolute and start with the envelope site (got ${row.backlinksUrl})`,
  );
  assert.equal(
    row.backlinksUrl,
    `${data.site}/wiki/${row.slug}/backlinks/`,
    `row ${i} backlinksUrl must equal ${data.site}/wiki/${row.slug}/backlinks/`,
  );
  assert.ok(
    row.backlinksJsonUrl.startsWith(`${data.site}/wiki/`),
    `row ${i} backlinksJsonUrl must be absolute and start with the envelope site (got ${row.backlinksJsonUrl})`,
  );
  assert.equal(
    row.backlinksJsonUrl,
    `${data.site}/wiki/${row.slug}/backlinks.json`,
    `row ${i} backlinksJsonUrl must equal ${data.site}/wiki/${row.slug}/backlinks.json`,
  );
  // citeUrl / referencesUrl / relatedUrl complete the per-article API surface:
  // the citation page (/cite/), the outbound-reference index (references.json),
  // and the related-pages set (related.json) all exist per article, so a
  // consumer of the ranking can reach them without reconstructing the routes.
  assert.equal(
    row.citeUrl,
    `${data.site}/wiki/${row.slug}/cite/`,
    `row ${i} citeUrl must equal ${data.site}/wiki/${row.slug}/cite/`,
  );
  // citeJsonUrl / bibtexUrl are the machine-readable citation companions of
  // citeUrl: the structured citation metadata (cite.json) and a ready-to-use
  // BibTeX record (cite.bib), both of which exist per article — the same trio
  // info.json already exposes — so a consumer can fetch a citation directly.
  assert.equal(
    row.citeJsonUrl,
    `${data.site}/wiki/${row.slug}/cite.json`,
    `row ${i} citeJsonUrl must equal ${data.site}/wiki/${row.slug}/cite.json`,
  );
  assert.equal(
    row.bibtexUrl,
    `${data.site}/wiki/${row.slug}/cite.bib`,
    `row ${i} bibtexUrl must equal ${data.site}/wiki/${row.slug}/cite.bib`,
  );
  assert.equal(
    row.referencesUrl,
    `${data.site}/wiki/${row.slug}/references.json`,
    `row ${i} referencesUrl must equal ${data.site}/wiki/${row.slug}/references.json`,
  );
  assert.equal(
    row.relatedUrl,
    `${data.site}/wiki/${row.slug}/related.json`,
    `row ${i} relatedUrl must equal ${data.site}/wiki/${row.slug}/related.json`,
  );
  // imageUrl is the article's OG share-card (/og/<slug>.png) — each article
  // binds its own card, so a dashboard of the top-ranked pages can render a
  // per-article thumbnail without parsing the rendered HTML head.
  assert.equal(
    row.imageUrl,
    `${data.site}/og/${row.slug}.png`,
    `row ${i} imageUrl must equal ${data.site}/og/${row.slug}.png`,
  );
});
for (let i = 1; i < data.pages.length; i++) {
  assert.ok(data.pages[i - 1].backlinks >= data.pages[i].backlinks, `rows must be sorted by backlinks descending (row ${i - 1} >= row ${i})`);
}

// ---- 5) JSON/HTML parity: backlinksUrl must match the rendered count link ---
const htmlFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'mostlinkedpages', 'index.html');
assert.ok(fs.existsSync(htmlFile), 'dist/wiki/special/mostlinkedpages/index.html not found; run the build first');
const html = fs.readFileSync(htmlFile, 'utf8');
const htmlRows = [...html.matchAll(/<li[^>]*class="mw-ml-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  slug: (((block.match(/mw-ml-title[^>]*href="([^"]+)"/) || [])[1] || '').match(/^\/wiki\/(.+)\/$/) || [])[1],
  backlinksPath: (block.match(/mw-ml-count[^>]*href="([^"]+)"/) || [])[1],
}));
assert.equal(
  htmlRows.length,
  data.pages.length,
  `the JSON ranking (${data.pages.length}) and HTML page (${htmlRows.length}) must list the same number of rows`,
);
htmlRows.forEach((row, i) => {
  assert.equal(data.pages[i].slug, row.slug, `row ${i}: JSON slug (${data.pages[i].slug}) must equal the HTML row slug (${row.slug})`);
  assert.equal(
    data.pages[i].backlinksUrl,
    `${data.site}${row.backlinksPath}`,
    `row ${i}: JSON backlinksUrl must match the HTML count link`,
  );
});

console.log(`Most linked pages JSON check passed (${data.count} ranked articles, top=${data.pages[0].slug} with ${data.pages[0].backlinks} backlinks)`);
