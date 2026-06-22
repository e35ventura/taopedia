import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';

// Load-bearing check for /wiki/<slug>/info.json: the machine-readable companion
// to the per-article Page-information page. It (1) unit-tests the builder,
// (2) confirms every article has a built info.json with the correct shape,
// (3) verifies each field against the ground-truth build artifacts (slugmap,
// backlinks.json, public/history/), (4) confirms URL fields are correctly
// formed, and (5) confirms HTML/JSON parity — the JSON must report the same
// categories, incoming-link count, revision count, and dates as the rendered
// /wiki/<slug>/info/ HTML page so the two surfaces cannot drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const result = buildArticleInfo({
    title: 'Dynamic TAO',
    slug: 'dynamic_tao',
    origin: ORIGIN,
    categories: ['Economics', 'Tokenomics'],
    incomingLinks: 5,
    revisionCount: 12,
    firstEdited: '2024-11-01T09:15:00.000Z',
    lastEdited: '2026-06-21T15:23:20.000Z',
  });
  assert.equal(result.title, 'Dynamic TAO', 'builder: title');
  assert.equal(result.slug, 'dynamic_tao', 'builder: slug');
  assert.equal(result.url, `${ORIGIN}/wiki/dynamic_tao/`, 'builder: url');
  assert.deepEqual(result.categories, ['Economics', 'Tokenomics'], 'builder: categories');
  assert.equal(result.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/dynamic_tao/backlinks/`, 'builder: backlinksUrl');
  assert.equal(result.revisionCount, 12, 'builder: revisionCount');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/dynamic_tao/history/`, 'builder: historyUrl');
  assert.equal(result.firstEdited, '2024-11-01T09:15:00.000Z', 'builder: firstEdited');
  assert.equal(result.lastEdited, '2026-06-21T15:23:20.000Z', 'builder: lastEdited');

  const empty = buildArticleInfo({ title: 'Stub', slug: 'stub', origin: ORIGIN });
  assert.deepEqual(empty.categories, [], 'builder: empty categories defaults to []');
  assert.equal(empty.incomingLinks, 0, 'builder: empty incomingLinks defaults to 0');
  assert.equal(empty.revisionCount, 0, 'builder: empty revisionCount defaults to 0');
  assert.equal(empty.firstEdited, null, 'builder: empty firstEdited defaults to null');
  assert.equal(empty.lastEdited, null, 'builder: empty lastEdited defaults to null');
}

// ---- 2–5) Built-output checks ----------------------------------------------
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

const inboundCountFor = (slug) =>
  (backlinksData[slug] ?? []).filter((entry) => slugmap[entry.from]).length;

const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).history ?? [];
};

// Extract the text content from a dd[data-info="key"] block (tags stripped).
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const infoField = (html, key) => {
  const m = html.match(new RegExp(`<dd[^>]*data-info="${key}"[^>]*>([\\s\\S]*?)</dd>`));
  return m ? m[1] : null;
};
const toNumber = (block) => Number((block ?? '').replace(/<[^>]*>/g, '').replace(/[^0-9]/g, ''));

let verifiedWithLinks = 0;
let verifiedMultiRevision = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE
  const jsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have an info.json, but /wiki/${slug}/info.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE
  assert.equal(typeof doc.title, 'string', `${slug}: info.json title must be a string`);
  assert.equal(typeof doc.slug, 'string', `${slug}: info.json slug must be a string`);
  assert.equal(doc.slug, slug, `${slug}: info.json slug must equal the article slug`);
  assert.ok(Array.isArray(doc.categories), `${slug}: info.json categories must be an array`);
  assert.equal(typeof doc.incomingLinks, 'number', `${slug}: info.json incomingLinks must be a number`);
  assert.equal(typeof doc.revisionCount, 'number', `${slug}: info.json revisionCount must be a number`);

  // 4) CORRECTNESS against ground truth
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: info.json url must be the canonical article URL`);
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: info.json backlinksUrl must point to the What-links-here page`);
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: info.json historyUrl must point to the history page`);

  const expectedCategories = slugmap[slug]?.categories ?? [];
  assert.deepEqual(doc.categories, expectedCategories, `${slug}: info.json categories must match the article's slugmap entry`);

  const expectedIncomingLinks = inboundCountFor(slug);
  assert.equal(doc.incomingLinks, expectedIncomingLinks, `${slug}: info.json incomingLinks must match the published inbound-link count from the link graph`);

  const history = historyOf(slug);
  assert.equal(doc.revisionCount, history.length, `${slug}: info.json revisionCount must match the article's history length`);
  if (history.length > 0) {
    assert.equal(doc.lastEdited, history[0].date, `${slug}: info.json lastEdited must equal the newest revision date`);
    assert.equal(doc.firstEdited, history[history.length - 1].date, `${slug}: info.json firstEdited must equal the oldest revision date`);
  } else {
    assert.equal(doc.firstEdited, null, `${slug}: info.json firstEdited must be null when there are no revisions`);
    assert.equal(doc.lastEdited, null, `${slug}: info.json lastEdited must be null when there are no revisions`);
  }

  // 5) HTML/JSON PARITY: same figures as the rendered /wiki/<slug>/info/ page
  const htmlFile = path.join(wikiDir, slug, 'info', 'index.html');
  if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');

    const categoriesField = infoField(html, 'categories');
    if (categoriesField !== null) {
      const htmlCategories = [
        ...categoriesField.matchAll(/<a[^>]*href="\/wiki\/category\/[^"]*"[^>]*>([^<]*)<\/a>/g),
      ].map((m) => decode(m[1]));
      assert.deepEqual(
        doc.categories,
        htmlCategories,
        `/wiki/${slug}/info.json categories must match the rendered info page`,
      );
    }

    const inboundField = infoField(html, 'inbound');
    if (inboundField !== null) {
      assert.equal(
        doc.incomingLinks,
        toNumber(inboundField),
        `/wiki/${slug}/info.json incomingLinks must match the count on the rendered info page`,
      );
    }

    const revisionsField = infoField(html, 'revisions');
    if (revisionsField !== null) {
      assert.equal(
        doc.revisionCount,
        toNumber(revisionsField),
        `/wiki/${slug}/info.json revisionCount must match the count on the rendered info page`,
      );
    }

    if (history.length > 0) {
      const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(
        times.includes(doc.firstEdited),
        `/wiki/${slug}/info.json firstEdited must appear as a <time datetime> on the info page`,
      );
      assert.ok(
        times.includes(doc.lastEdited),
        `/wiki/${slug}/info.json lastEdited must appear as a <time datetime> on the info page`,
      );
    }
  }

  if (doc.incomingLinks > 0) verifiedWithLinks++;
  if (doc.revisionCount > 1) verifiedMultiRevision++;
}

assert.ok(verifiedWithLinks > 0, 'expected at least one article with inbound links to verify the link-count correctness');
assert.ok(verifiedMultiRevision > 0, 'expected at least one article with multiple revisions to verify firstEdited/lastEdited');

console.log(
  `Info JSON check passed (${articleSlugs.length} articles: ${verifiedWithLinks} with inbound links, ${verifiedMultiRevision} with multiple revisions; ground-truth + HTML/JSON parity verified)`,
);
