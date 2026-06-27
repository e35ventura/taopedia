import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUncategorizedPages } from './uncategorized-pages.js';
import { publishedInboundLinkCount } from './most-linked.js';
import { getArticleReferences } from '../src/lib/article-references.js';
import { uniqueFeedCategories } from '../src/lib/feed-categories.js';

// ---- 1) Unit: buildUncategorizedPages selects + orders pages correctly -------
//
// titleBySlug = the published articles. categoriesBySlug = each article's frontmatter
// topics (build-linkgraph.js / slugmap shape). A page is "uncategorized" when its
// deduped, blank-stripped topic set is empty: repeated topics collapse, blank entries
// drop, and an absent entry counts as none — the SAME uniqueFeedCategories normalize
// the category hubs, feeds, and statistics use.
{
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' };
  const categoriesBySlug = {
    alpha: ['Consensus'], // a real topic -> categorized
    beta: [], // empty -> uncategorized
    gamma: ['TAO', 'TAO'], // duplicate of one topic collapses to one -> categorized
    // delta: absent from the category map entirely -> uncategorized
  };

  assert.equal(uniqueFeedCategories(categoriesBySlug.alpha).length, 1, 'alpha has one real topic');
  assert.equal(uniqueFeedCategories(categoriesBySlug.gamma).length, 1, 'gamma duplicate topics collapse to one');
  assert.equal(uniqueFeedCategories(categoriesBySlug.beta).length, 0, 'beta has no topic');
  assert.equal(uniqueFeedCategories(categoriesBySlug.delta).length, 0, 'an absent category entry is uncategorized');

  assert.deepEqual(
    buildUncategorizedPages({ titleBySlug, categoriesBySlug }),
    [
      { slug: 'beta', title: 'Beta' },
      { slug: 'delta', title: 'Delta' },
    ],
    'uncategorized pages are the published articles with zero deduped topics, ordered by title (Beta before Delta)',
  );

  // A whitespace-only topic is not a real category — the page is still uncategorized.
  assert.deepEqual(
    buildUncategorizedPages({
      titleBySlug: { a: 'A', b: 'B' },
      categoriesBySlug: { a: ['   '], b: ['Mining'] },
    }),
    [{ slug: 'a', title: 'A' }],
    'a page whose only topic is blank/whitespace is uncategorized',
  );

  // Every page categorized yields no report rows.
  assert.deepEqual(
    buildUncategorizedPages({
      titleBySlug: { a: 'A', b: 'B' },
      categoriesBySlug: { a: ['Staking'], b: ['Consensus'] },
    }),
    [],
    'no uncategorized pages when every published article has a topic',
  );

  // Empty input yields no rows (no crash on missing maps).
  assert.deepEqual(buildUncategorizedPages({}), [], 'no uncategorized pages for an empty published set');
}

// Ordering: rows sort by title with the shared compareTitles collation (numeric, so
// "Subnet 9" precedes "Subnet 10"), then by a PLAIN code-unit slug tiebreak when
// titles match (subnet_10 before subnet_9) — the same tiebreak LonelyPages /
// DeadEndPages / references / search-data use, NOT compareTitles numeric collation on
// the slug.
{
  const numericTitles = buildUncategorizedPages({
    titleBySlug: { s10: 'Subnet 10', s9: 'Subnet 9' },
    categoriesBySlug: {},
  });
  assert.deepEqual(
    numericTitles.map((entry) => entry.slug),
    ['s9', 's10'],
    'rows sort by title with numeric collation (Subnet 9 before Subnet 10)',
  );

  const tiedTitles = buildUncategorizedPages({
    titleBySlug: { subnet_9: 'Shared Title', subnet_10: 'Shared Title' },
    categoriesBySlug: {},
  });
  assert.deepEqual(
    tiedTitles.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'same-title rows tiebreak on plain code-unit slug order (subnet_10 before subnet_9), matching site-wide listings',
  );
}

// ---- 2) Built-output contract: validate the served endpoint -----------------
//
// The route's whole point is the machine-readable JSON, so re-derive the expected
// report from the same public/data/slugmap.json the build wrote and assert
// dist/wiki/special/uncategorizedpages.json matches it field-for-field: a wrong
// envelope, a count/length mismatch, a page that actually HAS a topic leaking in as
// "uncategorized", a non-deterministic order, or enrichment that disagrees with the
// page's own info.json would silently mislead editors.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'uncategorizedpages.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/uncategorizedpages.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));

const realTitleBySlug = {};
const realCategoriesBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) {
  realTitleBySlug[slug] = entry?.title ?? slug;
  realCategoriesBySlug[slug] = Array.isArray(entry?.categories) ? entry.categories : [];
}
const expected = buildUncategorizedPages({ titleBySlug: realTitleBySlug, categoriesBySlug: realCategoriesBySlug });

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.uncategorizedpagesJsonUrl, `${data.site}/wiki/special/uncategorizedpages.json`, 'uncategorizedpagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `uncategorizedpages.json must list all ${expected.length} uncategorized pages (got ${data.pages.length})`);

// Partition invariant: the category hubs keep the articles WITH at least one topic and
// this report keeps the ones with none, so every published article lands in exactly
// one bucket. Their sizes must add up to the published total — an independent
// cross-check that the uncategorized set is neither over- nor under-inclusive (mirrors
// the lonely + most-linked partition in check-lonely-pages.js).
const categorizedCount = Object.keys(realTitleBySlug).filter(
  (slug) => uniqueFeedCategories(realCategoriesBySlug[slug]).length > 0,
).length;
assert.equal(
  expected.length + categorizedCount,
  Object.keys(realTitleBySlug).length,
  'uncategorized pages + categorized pages must partition every published article (zero topics vs at least one)',
);

data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the uncategorized ordering`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map`);
  assert.equal(row.title, realTitleBySlug[row.slug], `row ${i} (${row.slug}) title must equal the published title`);
  assert.ok(realTitleBySlug[row.slug], `row ${i} (${row.slug}) must be a published article`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  // The uncategorized invariant: a listed page must genuinely carry zero topics.
  assert.equal(
    uniqueFeedCategories(realCategoriesBySlug[row.slug]).length,
    0,
    `row ${i} (${row.slug}) must have zero topic categories to be uncategorized`,
  );
  assert.deepEqual(row.categories, [], `row ${i} (${row.slug}) categories must be the empty array by the uncategorized definition`);
  // incomingLinks / referencesCount are re-derived with the same published-only joins
  // the endpoint uses, so the figures cannot drift from the link graph.
  assert.equal(
    row.incomingLinks,
    publishedInboundLinkCount(backlinksData, row.slug, realTitleBySlug),
    `row ${i} (${row.slug}) incomingLinks must match the published inbound-link count`,
  );
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

  // Cross-check the enrichment against the page's own built info.json (an independent
  // source) so the two surfaces can never disagree.
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
    // info.json carries the page's real (deduped) topics; an uncategorized page's
    // info.json topics must therefore also be empty — a second, independent witness
    // of the invariant from the per-article surface.
    assert.deepEqual(
      uniqueFeedCategories(info.categories),
      [],
      `row ${i} (${row.slug}) info.json must also carry zero topics`,
    );
    assert.equal(row.summary, info.summary, `row ${i} (${row.slug}) summary must agree with its info.json`);
    assert.equal(row.infoJsonUrl, info.infoJsonUrl, `row ${i} (${row.slug}) infoJsonUrl must agree with its info.json`);
    assert.equal(row.backlinksJsonUrl, info.backlinksJsonUrl, `row ${i} (${row.slug}) backlinksJsonUrl must agree with its info.json`);
  }
});

console.log(
  `Uncategorized pages check passed (${data.pages.length} uncategorized pages from the built endpoint match the slug map; uncategorized + categorized partition all ${Object.keys(realTitleBySlug).length} published articles)`,
);
