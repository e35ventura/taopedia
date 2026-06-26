import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLongPages } from './long-pages.js';
import { getArticleReferences } from '../src/lib/article-references.js';

// ---- 1) Unit: buildLongPages orders every published article by length --------
{
  const titleBySlug = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma' };
  const wordCountBySlug = { alpha: 100, beta: 500, gamma: 300 };

  assert.deepEqual(
    buildLongPages({ titleBySlug, wordCountBySlug }),
    [
      { slug: 'beta', title: 'Beta', wordCount: 500 },
      { slug: 'gamma', title: 'Gamma', wordCount: 300 },
      { slug: 'alpha', title: 'Alpha', wordCount: 100 },
    ],
    'long pages are all published articles ranked longest-first',
  );

  assert.deepEqual(buildLongPages({}), [], 'no long pages for an empty published set');
}

// ---- 2) Built-output contract: validate the served endpoint -----------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'longpages.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
assert.ok(fs.existsSync(distFile), 'dist/wiki/special/longpages.json not found; run the build first');
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

const expected = buildLongPages({ titleBySlug: realTitleBySlug, wordCountBySlug });

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.longpagesJsonUrl, `${data.site}/wiki/special/longpages.json`, 'longpagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `longpages.json must list all ${expected.length} published pages (got ${data.pages.length})`);
assert.equal(data.pages.length, Object.keys(realTitleBySlug).length, 'long pages must include every published article');

// Monotonic longest-first ordering on the built output.
for (let i = 1; i < data.pages.length; i += 1) {
  assert.ok(
    data.pages[i - 1].wordCount >= data.pages[i].wordCount,
    `row ${i - 1} wordCount must be >= row ${i} wordCount (longest-first order)`,
  );
}

data.pages.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the long-page ordering`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the slug map`);
  assert.equal(row.wordCount, expected[i].wordCount, `row ${i} wordCount must match the ranking helper`);
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
  assert.equal(row.tocUrl, info.tocUrl, `row ${i} (${row.slug}) tocUrl must agree with its info.json`);
});

console.log(
  `Long pages check passed (${data.pages.length} articles ranked longest-first from the built endpoint match info.json ground truth)`,
);
