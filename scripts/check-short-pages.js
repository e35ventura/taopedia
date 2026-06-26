import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShortPages, SHORT_PAGE_WORD_THRESHOLD } from './short-pages.js';
import { getArticleReferences } from '../src/lib/article-references.js';

// ---- 1) Unit: buildShortPages selects + orders stubs correctly ---------------
{
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma' };
  const wordCountBySlug = { alpha: 100, beta: 400, gamma: 501 };

  assert.deepEqual(
    buildShortPages({ titleBySlug, wordCountBySlug }),
    [
      { slug: 'alpha', title: 'Alpha', wordCount: 100 },
      { slug: 'beta', title: 'Beta', wordCount: 400 },
    ],
    'short pages are published articles at or below the threshold, shortest first',
  );

  assert.deepEqual(
    buildShortPages({ titleBySlug, wordCountBySlug, threshold: 50 }),
    [],
    'no short pages when every article exceeds a lower threshold',
  );

  assert.deepEqual(buildShortPages({}), [], 'no short pages for an empty published set');
}

// Same-length stubs sort by title (numeric collation) then plain slug tiebreak.
{
  const tied = buildShortPages({
    titleBySlug: { subnet_9: 'Subnet 9', subnet_10: 'Subnet 10' },
    wordCountBySlug: { subnet_9: 50, subnet_10: 50 },
  });
  assert.deepEqual(
    tied.map((entry) => entry.slug),
    ['subnet_9', 'subnet_10'],
    'same-length stubs sort by title with numeric collation (Subnet 9 before Subnet 10)',
  );

  const tiedTitles = buildShortPages({
    titleBySlug: { subnet_9: 'Shared Title', subnet_10: 'Shared Title' },
    wordCountBySlug: { subnet_9: 50, subnet_10: 50 },
  });
  assert.deepEqual(
    tiedTitles.map((entry) => entry.slug),
    ['subnet_10', 'subnet_9'],
    'same-title stubs tiebreak on plain code-unit slug order (subnet_10 before subnet_9)',
  );
}

// ---- 2) Built-output contract: validate the served endpoint -----------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'shortpages.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/shortpages.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));

const realTitleBySlug = {};
const wordCountBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) {
  realTitleBySlug[slug] = entry?.title ?? slug;
  const infoFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(infoFile), `dist/wiki/${slug}/info.json must exist for word-count ground truth`);
  const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  wordCountBySlug[slug] = info.wordCount;
}

const expected = buildShortPages({ titleBySlug: realTitleBySlug, wordCountBySlug });

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.shortpagesJsonUrl, `${data.site}/wiki/special/shortpages.json`, 'shortpagesJsonUrl must be the canonical self-link');
assert.equal(data.threshold, SHORT_PAGE_WORD_THRESHOLD, 'threshold must match the shared stub constant');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `shortpages.json must list all ${expected.length} stub pages (got ${data.pages.length})`);

// Monotonic shortest-first ordering on the built output.
for (let i = 1; i < data.pages.length; i += 1) {
  assert.ok(
    data.pages[i - 1].wordCount <= data.pages[i].wordCount,
    `row ${i - 1} wordCount must be <= row ${i} wordCount (shortest-first order)`,
  );
}

data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the stub ordering`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map`);
  assert.equal(row.wordCount, expected[i].wordCount, `row ${i} wordCount must match the ranking helper`);
  assert.ok(row.wordCount <= SHORT_PAGE_WORD_THRESHOLD, `row ${i} (${row.slug}) must be at or below the stub threshold`);
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `row ${i} url must be the canonical article URL`);
  assert.equal(
    row.referencesCount,
    getArticleReferences({ slug: row.slug, linkGraph: linkgraphData, titleBySlug: realTitleBySlug }).length,
    `row ${i} (${row.slug}) referencesCount must match the published outbound-reference count`,
  );
  assert.equal(row.readingMinutes, Math.max(1, Math.ceil(row.wordCount / 200)), `row ${i} readingMinutes must equal ceil(wordCount / 200)`);
  assert.equal(row.imageUrl, `${data.site}/og/${row.slug}.png`, `row ${i} imageUrl must be the article OG share-card URL`);

  const infoFile = path.join(wikiDir, row.slug, 'info.json');
  const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  assert.equal(row.wordCount, info.wordCount, `row ${i} (${row.slug}) wordCount must agree with its info.json`);
  assert.equal(row.incomingLinks, info.incomingLinks, `row ${i} (${row.slug}) incomingLinks must agree with its info.json`);
  assert.equal(row.referencesCount, info.referencesCount, `row ${i} (${row.slug}) referencesCount must agree with its info.json`);
  assert.equal(row.sectionCount, info.sectionCount, `row ${i} (${row.slug}) sectionCount must agree with its info.json`);
  assert.equal(row.readingMinutes, info.readingMinutes, `row ${i} (${row.slug}) readingMinutes must agree with its info.json`);
  assert.equal(row.revisionCount, info.revisionCount, `row ${i} (${row.slug}) revisionCount must agree with its info.json`);
  assert.equal(row.infoJsonUrl, info.infoJsonUrl, `row ${i} (${row.slug}) infoJsonUrl must agree with its info.json`);
});

console.log(
  `Short pages check passed (${data.pages.length} stub pages at or below ${SHORT_PAGE_WORD_THRESHOLD} words from the built endpoint match info.json ground truth)`,
);
