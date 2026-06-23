import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';

// Load-bearing check for /wiki/<slug>/info.json: the machine-readable
// companion to the Page-information HTML page. It (1) unit-tests the builder,
// (2) confirms every article has a built info.json with the correct shape and
// link URLs, (3) verifies revisionCount/firstEdited/lastEdited against the
// ground-truth public/history/ files, and (4) checks incomingLinks against the
// published backlinks data filtered to the content collection.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const result = buildArticleInfo({
    title: 'Yuma Consensus',
    slug: 'yuma_consensus',
    origin: ORIGIN,
    categories: ['Consensus', 'Protocols'],
    incomingLinks: 5,
    revisionCount: 3,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2026-06-01T12:00:00.000Z',
  });
  assert.equal(result.title, 'Yuma Consensus', 'builder: title');
  assert.equal(result.slug, 'yuma_consensus', 'builder: slug');
  assert.equal(result.url, `${ORIGIN}/wiki/yuma_consensus/`, 'builder: url');
  assert.deepEqual(result.categories, ['Consensus', 'Protocols'], 'builder: categories');
  assert.equal(result.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks/`, 'builder: backlinksUrl');
  assert.equal(result.backlinksJsonUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks.json`, 'builder: backlinksJsonUrl');
  assert.equal(result.citeUrl, `${ORIGIN}/wiki/yuma_consensus/cite/`, 'builder: citeUrl');
  assert.equal(result.citeJsonUrl, `${ORIGIN}/wiki/yuma_consensus/cite.json`, 'builder: citeJsonUrl');
  assert.equal(result.bibtexUrl, `${ORIGIN}/wiki/yuma_consensus/cite.bib`, 'builder: bibtexUrl');
  assert.equal(result.infoUrl, `${ORIGIN}/wiki/yuma_consensus/info/`, 'builder: infoUrl');
  assert.equal(result.infoJsonUrl, `${ORIGIN}/wiki/yuma_consensus/info.json`, 'builder: infoJsonUrl');
  assert.equal(result.historyJsonUrl, `${ORIGIN}/wiki/yuma_consensus/history.json`, 'builder: historyJsonUrl');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/yuma_consensus/history/`, 'builder: historyUrl');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/yuma_consensus/references.json`, 'builder: referencesUrl');
  assert.equal(result.relatedUrl, `${ORIGIN}/wiki/yuma_consensus/related.json`, 'builder: relatedUrl');
  assert.equal(result.tocJsonUrl, `${ORIGIN}/wiki/yuma_consensus/toc.json`, 'builder: tocJsonUrl');
  assert.equal(result.revisionCount, 3, 'builder: revisionCount');
  assert.equal(result.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited');
  assert.equal(result.lastEdited, '2026-06-01T12:00:00.000Z', 'builder: lastEdited');

  // Defaults: empty categories, zero counts, null dates
  const empty = buildArticleInfo({ title: 'Empty', slug: 'empty', origin: ORIGIN });
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: default lastEdited is null');
}

// ---- 2–4) Built-output checks ----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = fs.existsSync(backlinksFile)
  ? JSON.parse(fs.readFileSync(backlinksFile, 'utf8'))
  : {};

// Collect published article slugs from built output (same walk as other checks)
const articleSlugs = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

// Build the set of published slugs for backlinks filtering (mirrors info.json.ts)
const publishedSlugs = new Set(articleSlugs);

let withHistory = 0;
let withoutHistory = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE
  const jsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have an info.json, but /wiki/${slug}/info.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE — verify every link URL is correct
  const title = slugmap[slug]?.title;
  assert.ok(title, `slugmap is missing a title for ${slug}`);
  assert.equal(doc.title, title, `${slug}: info.json title must equal the slugmap title`);
  assert.equal(doc.slug, slug, `${slug}: info.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: info.json url must be the canonical article URL`);
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: info.json backlinksUrl`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: info.json backlinksJsonUrl`);
  assert.equal(doc.citeUrl, `${ORIGIN}/wiki/${slug}/cite/`, `${slug}: info.json citeUrl`);
  assert.equal(doc.citeJsonUrl, `${ORIGIN}/wiki/${slug}/cite.json`, `${slug}: info.json citeJsonUrl`);
  assert.equal(doc.bibtexUrl, `${ORIGIN}/wiki/${slug}/cite.bib`, `${slug}: info.json bibtexUrl`);
  assert.equal(doc.infoUrl, `${ORIGIN}/wiki/${slug}/info/`, `${slug}: info.json infoUrl`);
  assert.equal(doc.infoJsonUrl, `${ORIGIN}/wiki/${slug}/info.json`, `${slug}: info.json infoJsonUrl`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: info.json historyJsonUrl`);
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: info.json historyUrl`);
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/${slug}/references.json`, `${slug}: info.json referencesUrl`);
  assert.equal(doc.relatedUrl, `${ORIGIN}/wiki/${slug}/related.json`, `${slug}: info.json relatedUrl`);
  // tocJsonUrl links to the article's machine-readable table-of-contents
  // endpoint, letting consumers navigate from the info hub to heading structure.
  assert.equal(doc.tocJsonUrl, `${ORIGIN}/wiki/${slug}/toc.json`, `${slug}: info.json tocJsonUrl must point at the article's table-of-contents endpoint`);

  assert.ok(Array.isArray(doc.categories), `${slug}: info.json categories must be an array`);
  assert.equal(typeof doc.incomingLinks, 'number', `${slug}: info.json incomingLinks must be a number`);
  assert.equal(typeof doc.revisionCount, 'number', `${slug}: info.json revisionCount must be a number`);

  // 4) CORRECTNESS against ground-truth history files
  const rawFile = path.join(historyDir, `${slug}.json`);
  const rawRevisions = fs.existsSync(rawFile)
    ? (JSON.parse(fs.readFileSync(rawFile, 'utf8')).history ?? [])
    : [];

  assert.equal(doc.revisionCount, rawRevisions.length, `${slug}: info.json revisionCount must match ground-truth history`);

  if (rawRevisions.length > 0) {
    assert.equal(doc.lastEdited, rawRevisions[0].date, `${slug}: info.json lastEdited must equal the newest revision date`);
    assert.equal(doc.firstEdited, rawRevisions[rawRevisions.length - 1].date, `${slug}: info.json firstEdited must equal the oldest revision date`);
    withHistory++;
  } else {
    assert.equal(doc.firstEdited, null, `${slug}: info.json firstEdited must be null when there are no revisions`);
    assert.equal(doc.lastEdited, null, `${slug}: info.json lastEdited must be null when there are no revisions`);
    withoutHistory++;
  }

  // Verify incomingLinks matches the published-filtered backlinks count
  const expectedIncoming = (backlinksData[slug] ?? []).filter((entry) => publishedSlugs.has(entry.from)).length;
  assert.equal(doc.incomingLinks, expectedIncoming, `${slug}: info.json incomingLinks must match published-filtered backlinks count`);
}

assert.ok(withHistory > 0, 'expected at least one article with revision history to verify date correctness');

console.log(
  `Info JSON check passed (${articleSlugs.length} articles: ${withHistory} with history, ${withoutHistory} without; link URLs, revision data, and incomingLinks verified)`,
);
