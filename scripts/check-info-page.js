import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleInfo } from './article-info.js';

// Load-bearing regression check for the per-article "Page information"
// (action=info) pages at /wiki/<slug>/info/ and their machine-readable companion
// at /wiki/<slug>/info.json. It pins each rendered page's metadata to the
// ground-truth build data: topics (slugmap), incoming links (backlinks.json,
// published-only — the same join Special:WhatLinksHere uses), and revision
// count + creation/latest dates (public/history/<slug>.json) — plus coverage,
// the toolbar discovery link, and the JSON endpoint's companion-URL contract.
// If the page faked a figure, listed the wrong topics/links/revisions, lost a
// date, the toolbar stopped linking to it, or the JSON dropped a companion URL,
// this fails the build's test suite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const ORIGIN = 'https://taopedia.org';

// ---- 0) Unit: buildArticleInfo produces the correct JSON shape -------------
{
  const result = buildArticleInfo({
    title: 'Recycling',
    slug: 'recycling',
    origin: ORIGIN,
    categories: ['Consensus'],
    incomingLinks: 5,
    revisionCount: 3,
    firstEdited: '2024-01-01T00:00:00.000Z',
    lastEdited: '2024-06-01T00:00:00.000Z',
  });
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/recycling/backlinks/`, 'builder: backlinksUrl');
  assert.equal(result.citeUrl, `${ORIGIN}/wiki/recycling/cite/`, 'builder: citeUrl');
  assert.equal(result.citeJsonUrl, `${ORIGIN}/wiki/recycling/cite.json`, 'builder: citeJsonUrl');
  assert.equal(result.bibtexUrl, `${ORIGIN}/wiki/recycling/cite.bib`, 'builder: bibtexUrl');
  assert.equal(result.infoUrl, `${ORIGIN}/wiki/recycling/info/`, 'builder: infoUrl');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/recycling/history/`, 'builder: historyUrl');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/recycling/references.json`, 'builder: referencesUrl');
  assert.equal(result.relatedUrl, `${ORIGIN}/wiki/recycling/related.json`, 'builder: relatedUrl');
  assert.deepEqual(result.categories, ['Consensus'], 'builder: categories');
  assert.equal(result.incomingLinks, 5, 'builder: incomingLinks');
  assert.equal(result.revisionCount, 3, 'builder: revisionCount');

  const empty = buildArticleInfo({ title: 'X', slug: 'x', origin: ORIGIN });
  assert.equal(empty.incomingLinks, 0, 'builder: default incomingLinks is 0');
  assert.equal(empty.revisionCount, 0, 'builder: default revisionCount is 0');
  assert.equal(empty.firstEdited, null, 'builder: default firstEdited is null');
  assert.equal(empty.lastEdited, null, 'builder: default lastEdited is null');
  assert.deepEqual(empty.categories, [], 'builder: default categories is []');
  assert.equal(empty.citeUrl, `${ORIGIN}/wiki/x/cite/`, 'builder: citeUrl with defaults');
  assert.equal(empty.citeJsonUrl, `${ORIGIN}/wiki/x/cite.json`, 'builder: citeJsonUrl with defaults');
  assert.equal(empty.bibtexUrl, `${ORIGIN}/wiki/x/cite.bib`, 'builder: bibtexUrl with defaults');
  assert.equal(empty.infoUrl, `${ORIGIN}/wiki/x/info/`, 'builder: infoUrl with defaults');
  assert.equal(empty.referencesUrl, `${ORIGIN}/wiki/x/references.json`, 'builder: referencesUrl with defaults');
  assert.equal(empty.relatedUrl, `${ORIGIN}/wiki/x/related.json`, 'builder: relatedUrl with defaults');
}
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

  // info.json: the machine-readable companion must include every companion URL
  // that the HTML toolbar advertises (article, backlinks, cite, history, info) so
  // programmatic consumers can navigate the same link set.
  const infoJsonFile = path.join(wikiDir, slug, 'info.json');
  assert.ok(fs.existsSync(infoJsonFile), `/wiki/${slug}/info.json must be built alongside the HTML info page`);
  const infoJson = JSON.parse(fs.readFileSync(infoJsonFile, 'utf8'));
  assert.equal(infoJson.slug, slug, `/wiki/${slug}/info.json slug must match`);
  assert.ok(
    typeof infoJson.url === 'string' && /^https?:\/\//.test(infoJson.url),
    `/wiki/${slug}/info.json url must be an absolute URL`,
  );
  // incomingLinks must use the same published-only inbound-link join as the HTML
  // info page (and Special:WhatLinksHere), so the two surfaces cannot drift.
  assert.equal(
    infoJson.incomingLinks,
    inboundCountFor(slug),
    `/wiki/${slug}/info.json incomingLinks must match the published inbound-link count shown on the HTML info page`,
  );
  // Extract the origin from the article URL so the companion-URL checks are
  // independent of the configured site value.
  const jsonOrigin = new URL(infoJson.url).origin;
  assert.equal(infoJson.backlinksUrl, `${jsonOrigin}/wiki/${slug}/backlinks/`, `/wiki/${slug}/info.json backlinksUrl`);
  assert.equal(infoJson.citeUrl, `${jsonOrigin}/wiki/${slug}/cite/`, `/wiki/${slug}/info.json citeUrl`);
  assert.equal(infoJson.citeJsonUrl, `${jsonOrigin}/wiki/${slug}/cite.json`, `/wiki/${slug}/info.json citeJsonUrl`);
  assert.equal(infoJson.bibtexUrl, `${jsonOrigin}/wiki/${slug}/cite.bib`, `/wiki/${slug}/info.json bibtexUrl`);
  assert.equal(infoJson.infoUrl, `${jsonOrigin}/wiki/${slug}/info/`, `/wiki/${slug}/info.json infoUrl`);
  assert.equal(infoJson.historyUrl, `${jsonOrigin}/wiki/${slug}/history/`, `/wiki/${slug}/info.json historyUrl`);
  assert.equal(infoJson.referencesUrl, `${jsonOrigin}/wiki/${slug}/references.json`, `/wiki/${slug}/info.json referencesUrl`);
  assert.equal(infoJson.relatedUrl, `${jsonOrigin}/wiki/${slug}/related.json`, `/wiki/${slug}/info.json relatedUrl`);

  if (inboundCountFor(slug) > 0) verifiedWithLinks++;
  if (history.length > 1) verifiedMultiRevision++;
}
assert.ok(verifiedWithLinks > 0, 'expected at least one article with inbound links to verify against the link graph');
assert.ok(verifiedMultiRevision > 0, 'expected at least one article with multiple revisions to verify the revision count');

console.log(
  `Page-information check passed (${articleSlugs.length} pages; ${verifiedWithLinks} with inbound links and ${verifiedMultiRevision} with multiple revisions verified against the build data; toolbar discovery on every article)`,
);
