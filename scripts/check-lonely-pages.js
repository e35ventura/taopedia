import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLonelyPages } from './lonely-pages.js';
import { buildMostLinkedPages, publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

// ---- 1) Unit: buildLonelyPages selects + orders orphans correctly ----------
//
// titleBySlug = the published articles. backlinks = each article's inbound links
// (build-linkgraph.js shape). An article is "lonely" when no OTHER published
// article links to it: a self-link, or a link from an unpublished/draft source,
// never rescues it (the same published-only, self-excluded join MostLinkedPages
// and What-links-here use).
{
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' };
  const backlinks = {
    alpha: [{ from: 'beta' }], // linked by a published article -> not lonely
    beta: [{ from: 'alpha' }], // linked by a published article -> not lonely
    gamma: [{ from: 'gamma' }, { from: 'draft' }], // only a self-link + unpublished source -> lonely
    // delta: absent from the backlink graph entirely -> lonely
  };

  assert.equal(publishedInboundLinkCount(backlinks, 'gamma', titleBySlug), 0, 'self-link + unpublished source leaves gamma orphaned');
  assert.equal(publishedInboundLinkCount(backlinks, 'delta', titleBySlug), 0, 'a page absent from the backlink graph is orphaned');
  assert.equal(publishedInboundLinkCount(backlinks, 'alpha', titleBySlug), 1, 'alpha has a published inbound link');

  assert.deepEqual(
    buildLonelyPages({ titleBySlug, backlinks }),
    [
      { slug: 'delta', title: 'Delta' },
      { slug: 'gamma', title: 'Gamma' },
    ],
    'lonely pages are the published articles with zero published inbound links, ordered by title (Delta before Gamma)',
  );

  // A graph where every page is linked yields no orphans.
  assert.deepEqual(
    buildLonelyPages({
      titleBySlug: { a: 'A', b: 'B' },
      backlinks: { a: [{ from: 'b' }], b: [{ from: 'a' }] },
    }),
    [],
    'no lonely pages when every published article has a published inbound link',
  );

  // Empty input yields no orphans (no crash on missing maps).
  assert.deepEqual(buildLonelyPages({}), [], 'no lonely pages for an empty published set');
}

// Ordering: orphans sort by title with the shared compareTitles collation (numeric,
// so "Subnet 9" precedes "Subnet 10"), then by a PLAIN code-unit slug tiebreak when
// titles match (subnet_10 before subnet_9) — the same tiebreak MostLinkedPages /
// references / search-data use, NOT compareTitles numeric collation on the slug.
{
  const numericTitles = buildLonelyPages({
    titleBySlug: { s10: 'Subnet 10', s9: 'Subnet 9' },
    backlinks: {},
  });
  assert.deepEqual(
    numericTitles.map((entry) => entry.slug),
    ['s9', 's10'],
    'orphans sort by title with numeric collation (Subnet 9 before Subnet 10)',
  );

  const tiedTitles = buildLonelyPages({
    titleBySlug: { subnet_9: 'Shared Title', subnet_10: 'Shared Title' },
    backlinks: {},
  });
  assert.deepEqual(
    tiedTitles.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'same-title orphans tiebreak on plain code-unit slug order (subnet_10 before subnet_9), matching site-wide listings',
  );
}

// ---- 2) Built-output contract: validate the served endpoint -----------------
//
// The route's whole point is the machine-readable JSON, so re-derive the expected
// report from the same public/data/{backlinks,slugmap}.json the build wrote and
// assert dist/wiki/special/lonelypages.json matches it field-for-field: a wrong
// envelope, a count/length mismatch, a page that actually HAS inbound links leaking
// in as "lonely", a non-deterministic order, or enrichment that disagrees with the
// page's own info.json would silently mislead editors.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'lonelypages.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/lonelypages.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));

const realTitleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) realTitleBySlug[slug] = entry?.title ?? slug;
const expected = buildLonelyPages({ titleBySlug: realTitleBySlug, backlinks: backlinksData });

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.lonelypagesJsonUrl, `${data.site}/wiki/special/lonelypages.json`, 'lonelypagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `lonelypages.json must list all ${expected.length} orphaned pages (got ${data.pages.length})`);

// Partition invariant: MostLinkedPages keeps count > 0 and LonelyPages keeps
// count === 0, so every published article lands in exactly one report. Their sizes
// must add up to the published total — an independent cross-check that the orphan
// set is neither over- nor under-inclusive.
const mostLinked = buildMostLinkedPages({ backlinks: backlinksData, titleBySlug: realTitleBySlug });
assert.equal(
  expected.length + mostLinked.length,
  Object.keys(realTitleBySlug).length,
  'lonely pages + most-linked pages must partition every published article (count === 0 vs count > 0)',
);

data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the orphan ordering`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map`);
  assert.equal(row.title, realTitleBySlug[row.slug], `row ${i} (${row.slug}) title must equal the published title`);
  assert.ok(realTitleBySlug[row.slug], `row ${i} (${row.slug}) must be a published article`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  // The orphan invariant: a listed page must genuinely have zero published inbound links.
  assert.equal(
    publishedInboundLinkCount(backlinksData, row.slug, realTitleBySlug),
    0,
    `row ${i} (${row.slug}) must have zero published inbound links to be lonely`,
  );
  assert.equal(row.incomingLinks, 0, `row ${i} (${row.slug}) incomingLinks must be 0 by the orphan definition`);
  // referencesCount is re-derived with the same published-only outbound join the
  // endpoint uses, so the figure can't drift from the link graph.
  assert.equal(
    row.referencesCount,
    getArticleReferences({ slug: row.slug, linkGraph: linkgraphData, titleBySlug: realTitleBySlug }).length,
    `row ${i} (${row.slug}) referencesCount must match the published outbound-reference count`,
  );
  assert.ok(Number.isInteger(row.sectionCount) && row.sectionCount >= 0, `row ${i} sectionCount must be a non-negative integer`);
  assert.ok(Number.isInteger(row.wordCount) && row.wordCount >= 0, `row ${i} wordCount must be a non-negative integer`);
  assert.ok(Number.isInteger(row.readingMinutes) && row.readingMinutes >= 1, `row ${i} readingMinutes must be a positive integer`);
  assert.equal(row.readingMinutes, Math.max(1, Math.ceil(row.wordCount / 200)), `row ${i} readingMinutes must equal ceil(wordCount / 200)`);
  assert.equal(row.imageUrl, `${data.site}/og/${row.slug}.png`, `row ${i} imageUrl must be the article's OG share-card URL`);
  assert.equal(row.tocJsonUrl, `${data.site}/wiki/${row.slug}/toc.json`, `row ${i} tocJsonUrl must be the article's toc.json URL`);
  assert.equal(row.tocUrl, `${data.site}/wiki/${row.slug}/toc.json`, `row ${i} tocUrl must be the article's toc.json URL`);
  assert.equal(row.tocUrl, row.tocJsonUrl, `row ${i} tocUrl must equal tocJsonUrl for ${row.slug}`);

  // Cross-check the enrichment against the orphan's own built info.json (an
  // independent source) so the two surfaces can never disagree.
  const infoFile = path.join(wikiDir, row.slug, 'info.json');
  if (fs.existsSync(infoFile)) {
    const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    assert.equal(row.incomingLinks, info.incomingLinks, `row ${i} (${row.slug}) incomingLinks must agree with its info.json`);
    assert.equal(row.referencesCount, info.referencesCount, `row ${i} (${row.slug}) referencesCount must agree with its info.json`);
    assert.equal(row.sectionCount, info.sectionCount, `row ${i} (${row.slug}) sectionCount must agree with its info.json`);
    assert.equal(row.wordCount, info.wordCount, `row ${i} (${row.slug}) wordCount must agree with its info.json`);
    assert.equal(row.readingMinutes, info.readingMinutes, `row ${i} (${row.slug}) readingMinutes must agree with its info.json`);
    assert.equal(row.revisionCount, info.revisionCount, `row ${i} (${row.slug}) revisionCount must agree with its info.json`);
    assert.equal(row.firstEdited, info.firstEdited, `row ${i} (${row.slug}) firstEdited must agree with its info.json`);
    assert.equal(row.lastEdited, info.lastEdited, `row ${i} (${row.slug}) lastEdited must agree with its info.json`);
    assert.deepEqual(
      row.categories,
      uniqueFeedCategories(info.categories),
      `row ${i} (${row.slug}) categories must agree with its deduped info.json topics`,
    );
    assert.equal(row.summary, info.summary, `row ${i} (${row.slug}) summary must agree with its info.json`);
    assert.equal(row.infoJsonUrl, info.infoJsonUrl, `row ${i} (${row.slug}) infoJsonUrl must agree with its info.json`);
    assert.equal(row.backlinksJsonUrl, info.backlinksJsonUrl, `row ${i} (${row.slug}) backlinksJsonUrl must agree with its info.json`);
  }
});

console.log(
  `Lonely pages check passed (${data.pages.length} orphaned pages from the built endpoint match the link graph; lonely + most-linked partition all ${Object.keys(realTitleBySlug).length} published articles)`,
);
