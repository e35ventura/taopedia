import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing regression check for the per-article "Page information"
// (action=info) pages at /wiki/<slug>/info/. It pins each rendered page's
// metadata to the ground-truth build data: topics (slugmap), incoming links
// (backlinks.json, published-only — the same join Special:WhatLinksHere uses),
// and revision count + creation/latest dates (public/history/<slug>.json) — plus
// coverage and the toolbar discovery link. If the page faked a figure, listed
// the wrong topics/links/revisions, lost a date, or the toolbar stopped linking
// to it, this fails the build's test suite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const historyDir = path.join(projectRoot, 'public', 'history');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const backlinksData = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Article slugs: the same recursive walk + sub-page exclusion the sibling checks
// use, now including 'info' so the info pages themselves are not treated as
// articles needing their own info page.
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
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const inboundCountFor = (slug) => (backlinksData[slug] ?? []).filter((entry) => slugmap[entry.from]).length;
const historyOf = (slug) => {
  const file = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).history || [];
};

// Pull a single <dd data-info="key"> ... </dd> block out of the rendered page.
const infoField = (html, key) => {
  const m = html.match(new RegExp(`<dd[^>]*data-info="${key}"[^>]*>([\\s\\S]*?)</dd>`));
  return m ? m[1] : null;
};
// Parse the count from a field's visible text only — strip tags first so digits
// inside an href (e.g. /wiki/ss58_encoded/backlinks/) cannot pollute the number.
const toNumber = (block) => Number((block || '').replace(/<[^>]*>/g, '').replace(/[^0-9]/g, ''));

let verifiedWithLinks = 0;
let verifiedMultiRevision = 0;
for (const slug of articleSlugs) {
  const infoFile = path.join(wikiDir, slug, 'info', 'index.html');
  assert.ok(fs.existsSync(infoFile), `every article must have a Page-information page, but /wiki/${slug}/info/ was not built`);
  const html = fs.readFileSync(infoFile, 'utf8');

  // Topics: the rendered category links (text + order) must equal the article's
  // categories from the slug map.
  const categoriesField = infoField(html, 'categories');
  assert.ok(categoriesField !== null, `/wiki/${slug}/info/ is missing the topics field`);
  const renderedCategories = [...categoriesField.matchAll(/<a[^>]*href="\/wiki\/category\/[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => decode(m[1]));
  const expectedCategories = slugmap[slug]?.categories ?? [];
  assert.deepEqual(renderedCategories, expectedCategories, `/wiki/${slug}/info/ topics must match the article's categories`);

  // Incoming links: the rendered count must equal the published inbound-link
  // count from the link graph, and must link to this article's backlinks page.
  const inboundField = infoField(html, 'inbound');
  assert.ok(inboundField !== null, `/wiki/${slug}/info/ is missing the incoming-links field`);
  assert.ok(
    inboundField.includes(`href="/wiki/${slug}/backlinks/"`),
    `/wiki/${slug}/info/ incoming links must link to its What-links-here page`,
  );
  assert.equal(toNumber(inboundField), inboundCountFor(slug), `/wiki/${slug}/info/ incoming-link count must match the link graph`);

  // Revisions: the rendered count must equal the article's history length, and
  // must link to its History page.
  const revisionsField = infoField(html, 'revisions');
  const history = historyOf(slug);
  assert.ok(revisionsField !== null, `/wiki/${slug}/info/ is missing the revisions field`);
  assert.ok(
    revisionsField.includes(`href="/wiki/${slug}/history/"`),
    `/wiki/${slug}/info/ revisions must link to its History page`,
  );
  assert.equal(toNumber(revisionsField), history.length, `/wiki/${slug}/info/ revision count must match the article's history`);

  // Dates: when history exists, the page must show the creation date (oldest
  // revision) and the latest-revision date (newest) as <time> datetime values.
  if (history.length > 0) {
    const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
    const oldest = history[history.length - 1]?.date;
    const newest = history[0]?.date;
    assert.ok(times.includes(oldest), `/wiki/${slug}/info/ must show the creation date (oldest revision ${oldest})`);
    assert.ok(times.includes(newest), `/wiki/${slug}/info/ must show the latest-revision date (${newest})`);
  }

  // Discovery: the article's own toolbar must link to its info page, so it is
  // reachable on-site rather than only by guessing the URL.
  const articleHtml = fs.readFileSync(path.join(wikiDir, slug, 'index.html'), 'utf8');
  assert.ok(
    articleHtml.includes(`href="/wiki/${slug}/info/"`),
    `the article toolbar for /wiki/${slug}/ must link to its Page information (discovery path)`,
  );

  if (inboundCountFor(slug) > 0) verifiedWithLinks++;
  if (history.length > 1) verifiedMultiRevision++;
}
assert.ok(verifiedWithLinks > 0, 'expected at least one article with inbound links to verify against the link graph');
assert.ok(verifiedMultiRevision > 0, 'expected at least one article with multiple revisions to verify the revision count');

console.log(
  `Page-information check passed (${articleSlugs.length} pages; ${verifiedWithLinks} with inbound links and ${verifiedMultiRevision} with multiple revisions verified against the build data; toolbar discovery on every article)`,
);
