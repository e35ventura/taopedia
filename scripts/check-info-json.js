import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';

// Load-bearing check for /wiki/<slug>/info.json: the machine-readable companion
// to the Page-information HTML page. It (1) unit-tests the buildArticleInfo()
// builder, (2) confirms every article has a built info.json with the correct
// shape and field types, (3) verifies each value against ground-truth build data
// (slugmap, backlinks.json, public/history/*.json), and (4) checks JSON/HTML
// parity — the JSON and HTML info surfaces must agree on categories, incoming
// links, revision count, and dates so the two cannot drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape -----------------------
{
  const full = buildArticleInfo({
    title: 'Yuma Consensus',
    slug: 'yuma_consensus',
    origin: ORIGIN,
    categories: ['Consensus', 'Mechanisms'],
    incomingLinks: 5,
    revisionCount: 3,
    firstEdited: '2024-01-15T00:00:00.000Z',
    lastEdited: '2024-06-01T12:00:00.000Z',
  });
  assert.equal(full.title, 'Yuma Consensus', 'builder: title field');
  assert.equal(full.slug, 'yuma_consensus', 'builder: slug field');
  assert.equal(full.url, `${ORIGIN}/wiki/yuma_consensus/`, 'builder: url field');
  assert.deepEqual(full.categories, ['Consensus', 'Mechanisms'], 'builder: categories field');
  assert.equal(full.incomingLinks, 5, 'builder: incomingLinks field');
  assert.equal(full.backlinksUrl, `${ORIGIN}/wiki/yuma_consensus/backlinks/`, 'builder: backlinksUrl field');
  assert.equal(full.revisionCount, 3, 'builder: revisionCount field');
  assert.equal(full.historyUrl, `${ORIGIN}/wiki/yuma_consensus/history/`, 'builder: historyUrl field');
  assert.equal(full.firstEdited, '2024-01-15T00:00:00.000Z', 'builder: firstEdited field');
  assert.equal(full.lastEdited, '2024-06-01T12:00:00.000Z', 'builder: lastEdited field');

  const minimal = buildArticleInfo({
    title: 'Orphan',
    slug: 'orphan',
    origin: ORIGIN,
  });
  assert.deepEqual(minimal.categories, [], 'builder: default categories is []');
  assert.equal(minimal.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(minimal.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(minimal.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(minimal.lastEdited, null, 'builder: default lastEdited is null');
}

// ---- 2–4) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));

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

const articleBuilt = (slug) => fs.existsSync(path.join(wikiDir, slug, 'index.html'));

const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
};

const inboundCountFor = (slug) =>
  (backlinksData[slug] ?? []).filter((entry) => slugmap[entry.from]).length;

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Pull a single <dd data-info="key"> ... </dd> block from the rendered info page.
const infoField = (html, key) => {
  const m = html.match(new RegExp(`<dd[^>]*data-info="${key}"[^>]*>([\\s\\S]*?)</dd>`));
  return m ? m[1] : null;
};
const toNumber = (block) => Number((block || '').replace(/<[^>]*>/g, '').replace(/[^0-9]/g, ''));

let withLinks = 0;
let withHistory = 0;
let withCategories = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE: every article must have an info.json
  const jsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have an info.json, but /wiki/${slug}/info.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE: required fields present and correctly typed
  assert.equal(typeof doc.title, 'string', `${slug}: info.json title must be a string`);
  assert.equal(typeof doc.slug, 'string', `${slug}: info.json slug must be a string`);
  assert.equal(typeof doc.url, 'string', `${slug}: info.json url must be a string`);
  assert.ok(Array.isArray(doc.categories), `${slug}: info.json categories must be an array`);
  assert.equal(typeof doc.incomingLinks, 'number', `${slug}: info.json incomingLinks must be a number`);
  assert.equal(typeof doc.backlinksUrl, 'string', `${slug}: info.json backlinksUrl must be a string`);
  assert.equal(typeof doc.revisionCount, 'number', `${slug}: info.json revisionCount must be a number`);
  assert.equal(typeof doc.historyUrl, 'string', `${slug}: info.json historyUrl must be a string`);

  // 4) CORRECTNESS against ground truth
  const history = historyOf(slug);
  const expectedInbound = inboundCountFor(slug);
  const expectedFirst = history.length > 0 ? (history[history.length - 1]?.date ?? null) : null;
  const expectedLast = history.length > 0 ? (history[0]?.date ?? null) : null;
  const expectedCategories = slugmap[slug]?.categories ?? [];

  const expected = buildArticleInfo({
    title: slugmap[slug]?.title ?? doc.title,
    slug,
    origin: ORIGIN,
    categories: expectedCategories,
    incomingLinks: expectedInbound,
    revisionCount: history.length,
    firstEdited: expectedFirst,
    lastEdited: expectedLast,
  });

  assert.equal(doc.slug, slug, `${slug}: info.json slug must equal the article slug`);
  assert.equal(doc.url, expected.url, `${slug}: info.json url must be the canonical article URL`);
  assert.equal(doc.backlinksUrl, expected.backlinksUrl, `${slug}: info.json backlinksUrl must point to the backlinks page`);
  assert.equal(doc.historyUrl, expected.historyUrl, `${slug}: info.json historyUrl must point to the history page`);
  assert.deepEqual(doc.categories, expected.categories, `${slug}: info.json categories must match the slug map`);
  assert.equal(doc.incomingLinks, expected.incomingLinks, `${slug}: info.json incomingLinks must match the link graph`);
  assert.equal(doc.revisionCount, expected.revisionCount, `${slug}: info.json revisionCount must match the article history`);
  assert.equal(doc.firstEdited, expected.firstEdited, `${slug}: info.json firstEdited must match the oldest revision`);
  assert.equal(doc.lastEdited, expected.lastEdited, `${slug}: info.json lastEdited must match the newest revision`);

  // 5) JSON/HTML PARITY: the info.json values must agree with the rendered info page
  const infoFile = path.join(wikiDir, slug, 'info', 'index.html');
  if (fs.existsSync(infoFile)) {
    const html = fs.readFileSync(infoFile, 'utf8');

    // Categories parity
    const categoriesField = infoField(html, 'categories');
    if (categoriesField !== null) {
      const renderedCategories = [...categoriesField.matchAll(/<a[^>]*href="\/wiki\/category\/[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => decode(m[1]));
      assert.deepEqual(doc.categories, renderedCategories, `${slug}: info.json categories must match the HTML info page`);
    }

    // Incoming links parity
    const inboundField = infoField(html, 'inbound');
    if (inboundField !== null) {
      assert.equal(doc.incomingLinks, toNumber(inboundField), `${slug}: info.json incomingLinks must match the HTML info page`);
    }

    // Revision count parity
    const revisionsField = infoField(html, 'revisions');
    if (revisionsField !== null) {
      assert.equal(doc.revisionCount, toNumber(revisionsField), `${slug}: info.json revisionCount must match the HTML info page`);
    }

    // Dates parity
    if (history.length > 0) {
      const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
      if (doc.firstEdited) {
        assert.ok(times.includes(doc.firstEdited), `${slug}: info.json firstEdited must appear in the HTML info page`);
      }
      if (doc.lastEdited) {
        assert.ok(times.includes(doc.lastEdited), `${slug}: info.json lastEdited must appear in the HTML info page`);
      }
    }
  }

  if (expectedInbound > 0) withLinks++;
  if (history.length > 0) withHistory++;
  if (expectedCategories.length > 0) withCategories++;
}

assert.ok(withLinks > 0, 'expected at least one article with inbound links to verify against the link graph');
assert.ok(withHistory > 0, 'expected at least one article with revision history to verify dates');
assert.ok(withCategories > 0, 'expected at least one article with categories to verify topic parity');

console.log(
  `Info JSON check passed (${articleSlugs.length} articles: ${withLinks} with inbound links, ${withHistory} with history, ${withCategories} with categories; ground-truth + HTML/JSON parity verified)`,
);
