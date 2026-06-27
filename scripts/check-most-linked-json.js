import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedPages } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

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

// ---- 1b) Self-links are not counted as inbound links ----------------------
//
// An article that links to itself must not count toward its own inbound total
// (and must not appear as its own backlink). This matches getArticleReferences,
// which excludes self on the outbound side (target === slug). The backlink graph
// (build-linkgraph.js) drops self-links at build time, and publishedInboundLinkCount
// excludes `from === slug` as a second guard.
{
  const ranked = buildMostLinkedPages({
    backlinks: {
      a: [{ from: 'a' }, { from: 'b' }], // self-link from 'a' must NOT count
      b: [{ from: 'a' }],
    },
    titleBySlug: { a: 'Alpha', b: 'Beta' },
  });
  assert.deepEqual(
    ranked,
    [
      { slug: 'a', title: 'Alpha', count: 1 },
      { slug: 'b', title: 'Beta', count: 1 },
    ],
    'a self-link must not count toward an article’s own inbound total',
  );
}

// ---- 2) Tiebreak uses compareTitles for titles, raw slug when titles tie ----
//
// Different-title numeric-suffixed slugs must order numerically (subnet_9 before
// subnet_10) via compareTitles on the title. Same-title slug ties must use raw
// code-unit order (subnet_10 before subnet_9), matching references/backlinks.
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
    'tied numeric-suffixed entries with different titles must use compareTitles (Subnet 9 before Subnet 10)',
  );
}

// ---- 2b) Same-title slug ties use raw slug order --------------------------
{
  const sameTitle = buildMostLinkedPages({
    backlinks: {
      subnet_9: [{ from: 'x' }],
      subnet_10: [{ from: 'x' }],
      x: [],
    },
    titleBySlug: { subnet_9: 'Subnet', subnet_10: 'Subnet', x: 'X' },
  });
  assert.deepEqual(
    sameTitle.map((e) => e.slug),
    ['subnet_10', 'subnet_9'],
    'same-title slug ties must use raw slug order (subnet_10 before subnet_9), not compareTitles numeric slug collation',
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
assert.equal(
  data.mostlinkedpagesJsonUrl,
  `${data.site}/wiki/special/mostlinkedpages.json`,
  'mostlinkedpagesJsonUrl must be the canonical self-URL of the endpoint',
);
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
// linkgraph drives referencesCount (the published OUTBOUND reference count),
// re-derived with the same getArticleReferences helper the endpoint uses.
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const outboundCountFor = (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;

assert.equal(data.pages.length, expected.length, `mostlinkedpages.json must list all ${expected.length} ranked articles (got ${data.pages.length})`);
data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the link-graph ranking`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the article title for ${expected[i].slug}`);
  assert.equal(row.backlinks, expected[i].count, `row ${i} backlinks count must match the link graph`);
  // incomingLinks is the same inbound-link count aliased to the key name info.json
  // / references.json / backlinks.json use; it must equal the link-graph count and
  // the back-compat `backlinks` field.
  assert.equal(row.incomingLinks, expected[i].count, `row ${i} incomingLinks must match the link-graph count for ${row.slug}`);
  assert.equal(row.incomingLinks, row.backlinks, `row ${i} incomingLinks must equal the back-compat backlinks field for ${row.slug}`);
  // categories mirrors the article's topics (the same set allpages.json exposes
  // per entry), so a consumer can filter the ranking by topic. Source of truth
  // is the slug map.
  assert.ok(Array.isArray(row.categories), `row ${i} categories must be an array`);
  assert.deepEqual(
    row.categories,
    uniqueFeedCategories(slugmap[row.slug]?.categories),
    `row ${i} categories must match the deduped slug-map topics for ${row.slug}`,
  );
  // summary is the article's frontmatter summary (null when blank) — the same
  // field allpages.json / subnets.json expose per entry, so a consumer can show
  // a preview of each top-ranked page without a second fetch.
  assert.equal(
    row.summary,
    slugmap[row.slug]?.summary || null,
    `row ${i} summary must be the slug-map summary (null when blank) for ${row.slug}`,
  );
  assert.ok(Number.isInteger(row.backlinks) && row.backlinks > 0, `row ${i} backlinks must be a positive integer`);
  // referencesCount is the article's published OUTBOUND reference count — the
  // complement of backlinks — re-derived with the same getArticleReferences
  // helper the endpoint uses (published-only join), so the ranking and
  // references.json / cite.json / info.json can't disagree on outbound degree.
  assert.equal(
    row.referencesCount,
    outboundCountFor(row.slug),
    `row ${i} referencesCount must equal the published outbound-reference count for ${row.slug}`,
  );
  assert.ok(
    Number.isInteger(row.referencesCount) && row.referencesCount >= 0,
    `row ${i} referencesCount must be a non-negative integer (got ${row.referencesCount})`,
  );
  // sectionCount is the article's table-of-contents section count — the same
  // figure toc.json exposes as `count` and info.json / history.json expose on
  // their envelopes. Cross-check it against the sibling built toc.json (the
  // independent source of truth the endpoint renders) so they can't disagree.
  assert.ok(
    Number.isInteger(row.sectionCount) && row.sectionCount >= 0,
    `row ${i} sectionCount must be a non-negative integer (got ${JSON.stringify(row.sectionCount)})`,
  );
  const mlTocJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'toc.json');
  if (fs.existsSync(mlTocJsonFile)) {
    const tocDoc = JSON.parse(fs.readFileSync(mlTocJsonFile, 'utf8'));
    assert.equal(
      row.sectionCount,
      tocDoc.count,
      `row ${i} sectionCount must agree with the sibling toc.json count for ${row.slug}`,
    );
  }
  // wordCount is the article body's word count — the same figure info.json
  // exposes on its envelope. Validate its shape and cross-check it against the
  // sibling built info.json (the independent source) so the ranking and the
  // per-article metadata surface can't disagree on article length.
  assert.ok(
    Number.isInteger(row.wordCount) && row.wordCount >= 0,
    `row ${i} wordCount must be a non-negative integer (got ${JSON.stringify(row.wordCount)})`,
  );
  const mlWordInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(mlWordInfoJsonFile)) {
    const wordInfoDoc = JSON.parse(fs.readFileSync(mlWordInfoJsonFile, 'utf8'));
    assert.equal(
      row.wordCount,
      wordInfoDoc.wordCount,
      `row ${i} wordCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // readingMinutes is the ~200 wpm ceil reading-time estimate info.json exposes
  // and the article footer renders. Validate its shape, its derivation from the
  // row's own wordCount, and its agreement with the sibling info.json envelope.
  assert.equal(
    row.readingMinutes,
    Math.max(1, Math.ceil((Number.isFinite(row.wordCount) ? row.wordCount : 0) / 200)),
    `row ${i} readingMinutes must be the ~200 wpm ceil estimate of its own wordCount for ${row.slug}`,
  );
  const mlReadInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(mlReadInfoJsonFile)) {
    const readInfoDoc = JSON.parse(fs.readFileSync(mlReadInfoJsonFile, 'utf8'));
    assert.equal(
      row.readingMinutes,
      readInfoDoc.readingMinutes,
      `row ${i} readingMinutes must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // lastEdited is the article's last-revision date — the same figure info.json /
  // history.json expose per article and allpages.json exposes per directory
  // entry. Cross-check it against the sibling built info.json (independent
  // source) so the ranking and per-article surfaces can't disagree on recency.
  assert.ok(
    row.lastEdited === null || typeof row.lastEdited === 'string',
    `row ${i} lastEdited must be a string date or null (got ${JSON.stringify(row.lastEdited)})`,
  );
  // revisionCount (commit-history length) and firstEdited (oldest revision) are
  // the rest of the revision-stats trio info.json / history.json expose. Validate
  // their shape and cross-check both against the sibling info.json envelope.
  assert.ok(
    Number.isInteger(row.revisionCount) && row.revisionCount >= 0,
    `row ${i} revisionCount must be a non-negative integer (got ${JSON.stringify(row.revisionCount)})`,
  );
  assert.ok(
    row.firstEdited === null || typeof row.firstEdited === 'string',
    `row ${i} firstEdited must be a string date or null (got ${JSON.stringify(row.firstEdited)})`,
  );
  const mlInfoJsonFile = path.join(projectRoot, 'dist', 'wiki', row.slug, 'info.json');
  if (fs.existsSync(mlInfoJsonFile)) {
    const infoDoc = JSON.parse(fs.readFileSync(mlInfoJsonFile, 'utf8'));
    assert.equal(
      row.lastEdited,
      infoDoc.lastEdited,
      `row ${i} lastEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.revisionCount,
      infoDoc.revisionCount,
      `row ${i} revisionCount must agree with the sibling info.json envelope for ${row.slug}`,
    );
    assert.equal(
      row.firstEdited,
      infoDoc.firstEdited,
      `row ${i} firstEdited must agree with the sibling info.json envelope for ${row.slug}`,
    );
  }
  // infoUrl points at the article's Page-information page, the same companion
  // exposed elsewhere, so a consumer of the ranking can reach each top page's
  // metadata overview without rebuilding the route.
  assert.equal(
    row.infoUrl,
    `${data.site}/wiki/${row.slug}/info/`,
    `row ${i} infoUrl must equal ${data.site}/wiki/${row.slug}/info/`,
  );
  // infoJsonUrl is the JSON companion of infoUrl — /wiki/<slug>/info.json exists,
  // so each ranked entry pairs its HTML info link with the machine-readable one.
  assert.equal(
    row.infoJsonUrl,
    `${data.site}/wiki/${row.slug}/info.json`,
    `row ${i} infoJsonUrl must equal ${data.site}/wiki/${row.slug}/info.json`,
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
  // referencesJsonUrl / relatedJsonUrl are the same companion links under the
  // consistent <name>JsonUrl key the rest of the API uses; each equals its
  // back-compat un-suffixed twin.
  assert.equal(
    row.referencesJsonUrl,
    `${data.site}/wiki/${row.slug}/references.json`,
    `row ${i} referencesJsonUrl must equal ${data.site}/wiki/${row.slug}/references.json`,
  );
  assert.equal(row.referencesJsonUrl, row.referencesUrl, `row ${i} referencesJsonUrl must equal the back-compat referencesUrl`);
  assert.equal(
    row.relatedJsonUrl,
    `${data.site}/wiki/${row.slug}/related.json`,
    `row ${i} relatedJsonUrl must equal ${data.site}/wiki/${row.slug}/related.json`,
  );
  assert.equal(row.relatedJsonUrl, row.relatedUrl, `row ${i} relatedJsonUrl must equal the back-compat relatedUrl`);
  // tocJsonUrl is the machine-readable table-of-contents companion: the
  // per-article TOC endpoint (/wiki/<slug>/toc.json) shipped in #615, so a
  // consumer can fetch any top-ranked page's section outline directly.
  assert.equal(
    row.tocJsonUrl,
    `${data.site}/wiki/${row.slug}/toc.json`,
    `row ${i} tocJsonUrl must equal ${data.site}/wiki/${row.slug}/toc.json`,
  );
  // tocUrl is the toc companion's <name>Url alias — toc has no HTML page, so
  // it points at toc.json (same convention articleJsonCompanionUrls follows).
  assert.equal(
    row.tocUrl,
    `${data.site}/wiki/${row.slug}/toc.json`,
    `row ${i} tocUrl must equal ${data.site}/wiki/${row.slug}/toc.json`,
  );
  assert.equal(row.tocUrl, row.tocJsonUrl, `row ${i} tocUrl must equal tocJsonUrl for ${row.slug}`);
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
