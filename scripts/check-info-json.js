import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: buildArticleInfo behaviour ------------------------------------
{
  const full = buildArticleInfo({
    title: 'Yuma Consensus',
    slug: 'yuma_consensus',
    origin: ORIGIN,
    summary: 'Incentive mechanism.',
    categories: ['Consensus'],
    incomingLinks: 5,
    revisionCount: 3,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-15T12:00:00.000Z',
  });
  assert.equal(full.title, 'Yuma Consensus', 'builder: title');
  assert.equal(full.slug, 'yuma_consensus', 'builder: slug');
  assert.equal(full.summary, 'Incentive mechanism.', 'builder: summary');
  assert.equal(full.url, `${ORIGIN}/wiki/yuma_consensus/`, 'builder: url');
  assert.deepEqual(full.categories, ['Consensus'], 'builder: categories');
  assert.equal(full.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(full.revisionCount, 3, 'builder: revisionCount');
  assert.equal(full.firstEdited, '2024-01-01T00:00:00.000Z', 'builder: firstEdited');
  assert.equal(full.lastEdited, '2024-06-15T12:00:00.000Z', 'builder: lastEdited');
  assert.equal(full.infoUrl, `${ORIGIN}/wiki/yuma_consensus/info/`, 'builder: infoUrl self-link');
  assert.equal(full.infoJsonUrl, `${ORIGIN}/wiki/yuma_consensus/info.json`, 'builder: infoJsonUrl self-link');
  assert.equal(full.historyUrl, `${ORIGIN}/wiki/yuma_consensus/history/`, 'builder: historyUrl');
  assert.equal(full.historyJsonUrl, `${ORIGIN}/wiki/yuma_consensus/history.json`, 'builder: historyJsonUrl');
  assert.equal(full.backlinksUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks/`, 'builder: backlinksUrl');
  assert.equal(full.backlinksJsonUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks.json`, 'builder: backlinksJsonUrl');
  assert.equal(full.citeUrl, `${ORIGIN}/wiki/yuma_consensus/cite/`, 'builder: citeUrl');
  assert.equal(full.citeJsonUrl, `${ORIGIN}/wiki/yuma_consensus/cite.json`, 'builder: citeJsonUrl');
  assert.equal(full.bibtexUrl, `${ORIGIN}/wiki/yuma_consensus/cite.bib`, 'builder: bibtexUrl');
  assert.equal(full.referencesUrl, `${ORIGIN}/wiki/yuma_consensus/references.json`, 'builder: referencesUrl');
  assert.equal(full.relatedUrl, `${ORIGIN}/wiki/yuma_consensus/related.json`, 'builder: relatedUrl');
  assert.equal(full.tocJsonUrl, `${ORIGIN}/wiki/yuma_consensus/toc.json`, 'builder: tocJsonUrl');
  assert.equal(full.imageUrl, `${ORIGIN}/og/yuma_consensus.png`, 'builder: imageUrl');

  // Empty summary should become null
  const noSummary = buildArticleInfo({
    title: 'X',
    slug: 'x',
    origin: ORIGIN,
    summary: '',
    categories: [],
    incomingLinks: 0,
    revisionCount: 0,
    firstEdited: null,
    lastEdited: null,
  });
  assert.equal(noSummary.summary, null, 'builder: empty summary becomes null');
  assert.equal(noSummary.firstEdited, null, 'builder: null firstEdited stays null');
  assert.equal(noSummary.lastEdited, null, 'builder: null lastEdited stays null');
}

// ---- 2) Built-output checks -------------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));

// Derive the set of published slugs from the slug map (same source the Astro
// build uses via getCollection('pages')), so the incomingLinks count filters
// identically to info.json.ts.
const publishedSlugs = new Set(Object.keys(slugmap));

const SUBPAGES = new Set(['history', 'backlinks', 'cite', 'info']);
const articleSlugs = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    if (SUBPAGES.has(segs[segs.length - 2])) continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.history || [];
};

let withHistory = 0;
let withoutHistory = 0;
let withLinks = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have an info.json, but /wiki/${slug}/info.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const history = historyOf(slug);
  const incomingLinks = (backlinksData[slug] ?? []).filter((entry) => publishedSlugs.has(entry.from)).length;

  const title = slugmap[slug]?.title;
  assert.ok(title, `slugmap is missing a title for ${slug}`);

  const expected = buildArticleInfo({
    title,
    slug,
    origin: ORIGIN,
    summary: slugmap[slug]?.summary ?? '',
    categories: slugmap[slug]?.categories ?? [],
    incomingLinks,
    revisionCount: history.length,
    firstEdited: history[history.length - 1]?.date ?? null,
    lastEdited: history[0]?.date ?? null,
  });

  // Core identity fields
  assert.equal(doc.title, expected.title, `${slug}: info.json title must match the slug map`);
  assert.equal(doc.slug, expected.slug, `${slug}: info.json slug must match`);
  assert.equal(doc.url, expected.url, `${slug}: info.json url must be the canonical article URL`);
  assert.deepEqual(doc.summary, expected.summary, `${slug}: info.json summary must match the slug-map summary (or null)`);
  assert.deepEqual(doc.categories, expected.categories, `${slug}: info.json categories must match the slug-map categories`);

  // Revision metadata
  assert.equal(doc.revisionCount, expected.revisionCount, `${slug}: info.json revisionCount must match history length`);
  assert.deepEqual(doc.firstEdited, expected.firstEdited, `${slug}: info.json firstEdited must match oldest history entry`);
  assert.deepEqual(doc.lastEdited, expected.lastEdited, `${slug}: info.json lastEdited must match newest history entry`);

  // Incoming links
  assert.equal(doc.incomingLinks, expected.incomingLinks, `${slug}: info.json incomingLinks must count only published backlinks`);

  // Self-links
  assert.equal(doc.infoUrl, expected.infoUrl, `${slug}: info.json infoUrl must be the canonical HTML info page`);
  assert.equal(doc.infoJsonUrl, expected.infoJsonUrl, `${slug}: info.json infoJsonUrl must be its own canonical URL`);

  // Sibling cross-links
  assert.equal(doc.historyUrl, expected.historyUrl, `${slug}: info.json historyUrl cross-link`);
  assert.equal(doc.historyJsonUrl, expected.historyJsonUrl, `${slug}: info.json historyJsonUrl cross-link`);
  assert.equal(doc.backlinksUrl, expected.backlinksUrl, `${slug}: info.json backlinksUrl cross-link`);
  assert.equal(doc.backlinksJsonUrl, expected.backlinksJsonUrl, `${slug}: info.json backlinksJsonUrl cross-link`);
  assert.equal(doc.citeUrl, expected.citeUrl, `${slug}: info.json citeUrl cross-link`);
  assert.equal(doc.citeJsonUrl, expected.citeJsonUrl, `${slug}: info.json citeJsonUrl cross-link`);
  assert.equal(doc.bibtexUrl, expected.bibtexUrl, `${slug}: info.json bibtexUrl cross-link`);
  assert.equal(doc.referencesUrl, expected.referencesUrl, `${slug}: info.json referencesUrl cross-link`);
  assert.equal(doc.relatedUrl, expected.relatedUrl, `${slug}: info.json relatedUrl cross-link`);
  assert.equal(doc.tocJsonUrl, expected.tocJsonUrl, `${slug}: info.json tocJsonUrl cross-link`);
  assert.equal(doc.imageUrl, expected.imageUrl, `${slug}: info.json imageUrl cross-link`);

  if (history.length > 0) withHistory++;
  else withoutHistory++;
  if (incomingLinks > 0) withLinks++;
}

assert.ok(withHistory > 0, 'expected at least one article with revision history');
assert.ok(withLinks > 0, 'expected at least one article with incoming backlinks');

console.log(
  `Info JSON check passed (${articleSlugs.length} articles: ${withHistory} with history, ${withoutHistory} without; ${withLinks} with incoming backlinks; all fields verified against buildArticleInfo())`,
);
