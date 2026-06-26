import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeadEndPages } from './dead-end-pages.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

// ---- 1) Unit: buildDeadEndPages selects + orders dead-ends correctly --------
//
// titleBySlug = the published articles. linkGraph = each article's resolved
// outbound targets (build-linkgraph.js shape). An article is a "dead end" when it
// links OUT to no other published article: a self-link, or a link to an
// unpublished/missing target (a red link), never counts as a real outbound
// reference (the same published-only, self-excluded join references.json uses).
{
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' };
  const linkGraph = {
    alpha: [{ target: 'beta' }], // links to a published article -> not a dead end
    beta: [{ target: 'beta' }, { target: 'missing' }], // self-link + red link -> dead end
    gamma: [{ target: 'draft' }], // links only to an unpublished target -> dead end
    // delta: absent from the link graph entirely -> dead end
  };

  assert.equal(getArticleReferences({ slug: 'beta', linkGraph, titleBySlug }).length, 0, 'self-link + red link leaves beta a dead end');
  assert.equal(getArticleReferences({ slug: 'gamma', linkGraph, titleBySlug }).length, 0, 'a link to an unpublished target leaves gamma a dead end');
  assert.equal(getArticleReferences({ slug: 'delta', linkGraph, titleBySlug }).length, 0, 'a page absent from the link graph is a dead end');
  assert.equal(getArticleReferences({ slug: 'alpha', linkGraph, titleBySlug }).length, 1, 'alpha has a published outbound reference');

  assert.deepEqual(
    buildDeadEndPages({ titleBySlug, linkGraph }),
    [
      { slug: 'beta', title: 'Beta' },
      { slug: 'delta', title: 'Delta' },
      { slug: 'gamma', title: 'Gamma' },
    ],
    'dead-end pages are the published articles with zero published outbound references, ordered by title (Beta, Delta, Gamma)',
  );

  // A graph where every page links to a published article yields no dead ends.
  assert.deepEqual(
    buildDeadEndPages({
      titleBySlug: { a: 'A', b: 'B' },
      linkGraph: { a: [{ target: 'b' }], b: [{ target: 'a' }] },
    }),
    [],
    'no dead-end pages when every published article links out to a published article',
  );

  // Empty input yields no dead ends (no crash on missing maps).
  assert.deepEqual(buildDeadEndPages({}), [], 'no dead-end pages for an empty published set');
}

// Ordering: dead-ends sort by title with the shared compareTitles collation
// (numeric, so "Subnet 9" precedes "Subnet 10"), then by a PLAIN code-unit slug
// tiebreak when titles match (subnet_10 before subnet_9) — the same tiebreak
// references / MostLinkedPages / search-data use, NOT compareTitles on the slug.
{
  const numericTitles = buildDeadEndPages({
    titleBySlug: { s10: 'Subnet 10', s9: 'Subnet 9' },
    linkGraph: {},
  });
  assert.deepEqual(
    numericTitles.map((entry) => entry.slug),
    ['s9', 's10'],
    'dead-ends sort by title with numeric collation (Subnet 9 before Subnet 10)',
  );

  const tiedTitles = buildDeadEndPages({
    titleBySlug: { subnet_9: 'Shared Title', subnet_10: 'Shared Title' },
    linkGraph: {},
  });
  assert.deepEqual(
    tiedTitles.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'same-title dead-ends tiebreak on plain code-unit slug order (subnet_10 before subnet_9), matching site-wide listings',
  );
}

// ---- 2) Built-output contract: validate the served endpoint -----------------
//
// The route's whole point is the machine-readable JSON, so re-derive the expected
// report from the same public/data/{linkgraph,slugmap}.json the build wrote and
// assert dist/wiki/special/deadendpages.json matches it field-for-field: a wrong
// envelope, a count/length mismatch, a page that actually links OUT leaking in as a
// "dead end", a non-deterministic order, or enrichment that disagrees with the
// page's own info.json would silently mislead editors.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'deadendpages.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/deadendpages.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const realTitleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) realTitleBySlug[slug] = entry?.title ?? slug;
const expected = buildDeadEndPages({ titleBySlug: realTitleBySlug, linkGraph: linkgraphData });

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.deadendpagesJsonUrl, `${data.site}/wiki/special/deadendpages.json`, 'deadendpagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `deadendpages.json must list all ${expected.length} dead-end pages (got ${data.pages.length})`);

// Partition invariant: a published article has either zero published outbound
// references (a dead end) or at least one (it links out), so the dead-end report
// and the with-references set must add up to the published total — an independent
// cross-check that the dead-end set is neither over- nor under-inclusive.
const withReferences = Object.keys(realTitleBySlug).filter(
  (slug) => getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug: realTitleBySlug }).length > 0,
).length;
assert.equal(
  expected.length + withReferences,
  Object.keys(realTitleBySlug).length,
  'dead-end pages + pages with outbound references must partition every published article (count === 0 vs count > 0)',
);

data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the dead-end ordering`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map`);
  assert.equal(row.title, realTitleBySlug[row.slug], `row ${i} (${row.slug}) title must equal the published title`);
  assert.ok(realTitleBySlug[row.slug], `row ${i} (${row.slug}) must be a published article`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  // The dead-end invariant: a listed page must genuinely have zero published outbound references.
  assert.equal(
    getArticleReferences({ slug: row.slug, linkGraph: linkgraphData, titleBySlug: realTitleBySlug }).length,
    0,
    `row ${i} (${row.slug}) must have zero published outbound references to be a dead end`,
  );
  assert.equal(row.referencesCount, 0, `row ${i} (${row.slug}) referencesCount must be 0 by the dead-end definition`);
  // incomingLinks is re-derived with the same published-only inbound join the
  // endpoint uses (a dead end may still be linked TO), so the figure can't drift.
  assert.equal(
    row.incomingLinks,
    publishedInboundLinkCount(backlinksData, row.slug, realTitleBySlug),
    `row ${i} (${row.slug}) incomingLinks must match the published inbound-link count`,
  );
  assert.ok(Number.isInteger(row.sectionCount) && row.sectionCount >= 0, `row ${i} sectionCount must be a non-negative integer`);
  assert.ok(Number.isInteger(row.wordCount) && row.wordCount >= 0, `row ${i} wordCount must be a non-negative integer`);
  assert.ok(Number.isInteger(row.readingMinutes) && row.readingMinutes >= 1, `row ${i} readingMinutes must be a positive integer`);
  assert.equal(row.readingMinutes, Math.max(1, Math.ceil(row.wordCount / 200)), `row ${i} readingMinutes must equal ceil(wordCount / 200)`);
  assert.equal(row.imageUrl, `${data.site}/og/${row.slug}.png`, `row ${i} imageUrl must be the article's OG share-card URL`);
  assert.equal(row.tocJsonUrl, `${data.site}/wiki/${row.slug}/toc.json`, `row ${i} tocJsonUrl must be the article's toc.json URL`);
  assert.equal(row.tocUrl, `${data.site}/wiki/${row.slug}/toc.json`, `row ${i} tocUrl must be the article's toc.json URL`);
  assert.equal(row.tocUrl, row.tocJsonUrl, `row ${i} tocUrl must equal tocJsonUrl for ${row.slug}`);

  // Cross-check the enrichment against the dead-end's own built info.json (an
  // independent source) so the two surfaces can never disagree.
  const infoFile = path.join(wikiDir, row.slug, 'info.json');
  if (fs.existsSync(infoFile)) {
    const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    assert.equal(row.referencesCount, info.referencesCount, `row ${i} (${row.slug}) referencesCount must agree with its info.json`);
    assert.equal(row.incomingLinks, info.incomingLinks, `row ${i} (${row.slug}) incomingLinks must agree with its info.json`);
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
    assert.equal(row.referencesJsonUrl, info.referencesJsonUrl, `row ${i} (${row.slug}) referencesJsonUrl must agree with its info.json`);
  }
});

console.log(
  `Dead-end pages check passed (${data.pages.length} dead-end pages from the built endpoint match the link graph; dead-ends + pages-with-references partition all ${Object.keys(realTitleBySlug).length} published articles)`,
);
