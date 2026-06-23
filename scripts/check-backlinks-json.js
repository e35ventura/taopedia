import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleBacklinks } from './article-backlinks.js';

// Load-bearing check for /wiki/<slug>/backlinks.json: the machine-readable
// companion to the What-links-here HTML page. It (1) unit-tests the builder,
// (2) confirms every article has a built backlinks.json with the correct shape
// and a count that matches the array length, (3) verifies the entries match the
// ground-truth link graph (published-only join, same as the HTML page), (4)
// checks sort order, (5) checks the empty-state (count 0, empty array), and (6)
// confirms JSON/HTML parity — the JSON and HTML page must list the same set of
// linking articles so the two surfaces cannot drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const result = buildArticleBacklinks({
    slug: 'recycling',
    title: 'Recycling',
    origin: ORIGIN,
    backlinks: [
      { slug: 'neuron', title: 'Neuron' },
      { slug: 'subnet_1', title: 'Subnet 1' },
    ],
  });
  assert.equal(result.slug, 'recycling', 'builder: slug field');
  assert.equal(result.title, 'Recycling', 'builder: title field');
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url field');
  assert.equal(result.backlinksUrl, `${ORIGIN}/wiki/recycling/backlinks/`, 'builder: backlinksUrl field');
  assert.equal(result.backlinksJsonUrl, `${ORIGIN}/wiki/recycling/backlinks.json`, 'builder: backlinksJsonUrl field');
  assert.equal(result.historyUrl, `${ORIGIN}/wiki/recycling/history/`, 'builder: historyUrl field');
  assert.equal(result.historyJsonUrl, `${ORIGIN}/wiki/recycling/history.json`, 'builder: historyJsonUrl field');
  assert.equal(result.count, 2, 'builder: count equals backlinks length');
  assert.equal(result.backlinks.length, 2, 'builder: backlinks array length');
  assert.equal(result.backlinks[0].slug, 'neuron', 'builder: backlinks[0].slug');
  assert.equal(result.backlinks[0].title, 'Neuron', 'builder: backlinks[0].title');
  assert.equal(result.backlinks[0].url, `${ORIGIN}/wiki/neuron/`, 'builder: backlinks[0].url');
  assert.equal(result.backlinks[0].historyUrl, `${ORIGIN}/wiki/neuron/history/`, 'builder: backlinks[0].historyUrl');
  assert.equal(result.backlinks[0].historyJsonUrl, `${ORIGIN}/wiki/neuron/history.json`, 'builder: backlinks[0].historyJsonUrl');
  assert.equal(result.backlinks[0].citeUrl, `${ORIGIN}/wiki/neuron/cite/`, 'builder: backlinks[0].citeUrl');
  assert.equal(result.backlinks[0].citeJsonUrl, `${ORIGIN}/wiki/neuron/cite.json`, 'builder: backlinks[0].citeJsonUrl');
  assert.equal(result.backlinks[0].bibtexUrl, `${ORIGIN}/wiki/neuron/cite.bib`, 'builder: backlinks[0].bibtexUrl');
  assert.equal(result.backlinks[0].referencesUrl, `${ORIGIN}/wiki/neuron/references.json`, 'builder: backlinks[0].referencesUrl');
  assert.equal(result.backlinks[0].relatedUrl, `${ORIGIN}/wiki/neuron/related.json`, 'builder: backlinks[0].relatedUrl');
  assert.equal(result.backlinks[1].slug, 'subnet_1', 'builder: backlinks[1].slug');
  assert.equal(result.backlinks[1].title, 'Subnet 1', 'builder: backlinks[1].title');
  assert.equal(result.backlinks[1].url, `${ORIGIN}/wiki/subnet_1/`, 'builder: backlinks[1].url');
  assert.equal(result.backlinks[1].historyUrl, `${ORIGIN}/wiki/subnet_1/history/`, 'builder: backlinks[1].historyUrl');
  assert.equal(result.backlinks[1].historyJsonUrl, `${ORIGIN}/wiki/subnet_1/history.json`, 'builder: backlinks[1].historyJsonUrl');
  assert.equal(result.backlinks[1].citeUrl, `${ORIGIN}/wiki/subnet_1/cite/`, 'builder: backlinks[1].citeUrl');
  assert.equal(result.backlinks[1].citeJsonUrl, `${ORIGIN}/wiki/subnet_1/cite.json`, 'builder: backlinks[1].citeJsonUrl');
  assert.equal(result.backlinks[1].bibtexUrl, `${ORIGIN}/wiki/subnet_1/cite.bib`, 'builder: backlinks[1].bibtexUrl');
  assert.equal(result.backlinks[1].referencesUrl, `${ORIGIN}/wiki/subnet_1/references.json`, 'builder: backlinks[1].referencesUrl');
  assert.equal(result.backlinks[1].relatedUrl, `${ORIGIN}/wiki/subnet_1/related.json`, 'builder: backlinks[1].relatedUrl');

  const empty = buildArticleBacklinks({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.backlinks, [], 'builder: empty backlinks is []');
}

// ---- 2–6) Built-output checks ----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');

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

// Parse linking-article slugs from a rendered backlinks HTML page.
const htmlBacklinkSlugs = (html) =>
  [...html.matchAll(/<li[^>]*class="mw-wlh-row"[^>]*>[\s\S]*?href="\/wiki\/([^"]+)\/"[\s\S]*?<\/li>/g)].map(
    ([, slug]) => slug,
  );

let withLinks = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE: every article must have a backlinks.json
  const jsonFile = path.join(wikiDir, slug, 'backlinks.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a backlinks.json, but /wiki/${slug}/backlinks.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE: required fields present and correctly typed
  assert.equal(typeof doc.slug, 'string', `${slug}: backlinks.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: backlinks.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: backlinks.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: backlinks.json url must be the canonical article URL`);
  assert.equal(doc.backlinksUrl, `${ORIGIN}/wiki/${slug}/backlinks/`, `${slug}: backlinks.json backlinksUrl must point to the HTML page`);
  assert.equal(doc.backlinksJsonUrl, `${ORIGIN}/wiki/${slug}/backlinks.json`, `${slug}: backlinks.json must expose its own canonical backlinksJsonUrl`);
  assert.equal(doc.historyUrl, `${ORIGIN}/wiki/${slug}/history/`, `${slug}: backlinks.json historyUrl must point to the HTML history page`);
  assert.equal(doc.historyJsonUrl, `${ORIGIN}/wiki/${slug}/history.json`, `${slug}: backlinks.json historyJsonUrl must point to the machine-readable history page`);
  assert.equal(typeof doc.count, 'number', `${slug}: backlinks.json count must be a number`);
  assert.ok(Array.isArray(doc.backlinks), `${slug}: backlinks.json backlinks must be an array`);
  assert.equal(doc.count, doc.backlinks.length, `${slug}: backlinks.json count must equal backlinks.length`);

  // 4) CORRECTNESS against ground truth (published-only join)
  const expected = new Set(
    (backlinksData[slug] ?? []).map((e) => e.from).filter(articleBuilt),
  );
  const rendered = new Set(doc.backlinks.map((e) => e.slug));
  assert.deepEqual(rendered, expected, `/wiki/${slug}/backlinks.json must list exactly the published linking articles from the link graph`);

  // Per-entry shape
  for (const entry of doc.backlinks) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every backlink entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every backlink entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every backlink entry url must be the canonical article URL`);
    // historyUrl points at the linking article's revision-history page — the
    // same companion references.json / related.json expose per entry — so a
    // consumer can reach a backlinking page's history without rebuilding the route.
    assert.equal(
      entry.historyUrl,
      `${ORIGIN}/wiki/${entry.slug}/history/`,
      `${slug}: every backlink entry historyUrl must be the canonical article history URL`,
    );
    // historyJsonUrl is the JSON companion of historyUrl — references.json /
    // related.json already pair both per entry, so backlink entries match.
    assert.equal(
      entry.historyJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/history.json`,
      `${slug}: every backlink entry historyJsonUrl must be the canonical article history.json URL`,
    );
    assert.equal(
      entry.citeUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite/`,
      `${slug}: every backlink entry citeUrl must be the canonical article cite page`,
    );
    assert.equal(
      entry.citeJsonUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite.json`,
      `${slug}: every backlink entry citeJsonUrl must be the canonical article cite.json URL`,
    );
    assert.equal(
      entry.bibtexUrl,
      `${ORIGIN}/wiki/${entry.slug}/cite.bib`,
      `${slug}: every backlink entry bibtexUrl must be the canonical article cite.bib URL`,
    );
    assert.equal(
      entry.referencesUrl,
      `${ORIGIN}/wiki/${entry.slug}/references.json`,
      `${slug}: every backlink entry referencesUrl must be the canonical article references.json URL`,
    );
    assert.equal(
      entry.relatedUrl,
      `${ORIGIN}/wiki/${entry.slug}/related.json`,
      `${slug}: every backlink entry relatedUrl must be the canonical article related.json URL`,
    );
    assert.ok(articleBuilt(entry.slug), `${slug}: backlink entry ${entry.slug} references an unbuilt article`);
  }

  // 5) SORT ORDER: same compareTitles order as the HTML page
  for (let i = 1; i < doc.backlinks.length; i++) {
    const a = doc.backlinks[i - 1];
    const b = doc.backlinks[i];
    assert.ok(
      compareTitles(a.title, b.title) <= 0,
      `/wiki/${slug}/backlinks.json entries must be sorted by numeric title collation ("${a.title}" before "${b.title}")`,
    );
  }

  // 6) HTML/JSON PARITY: same set of linking slugs as the HTML backlinks page
  const htmlFile = path.join(wikiDir, slug, 'backlinks', 'index.html');
  if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const htmlSlugs = new Set(htmlBacklinkSlugs(html));
    assert.deepEqual(
      rendered,
      htmlSlugs,
      `/wiki/${slug}/backlinks.json and /wiki/${slug}/backlinks/ must list the same set of linking articles`,
    );
    assert.ok(
      html.includes(`href="/wiki/${slug}/history/"`),
      `/wiki/${slug}/backlinks/ toolbar must link to the article history page`,
    );
  }

  if (doc.count > 0) withLinks++;
  else withEmpty++;
}

assert.ok(withLinks > 0, 'expected at least one article with inbound links to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no inbound links to verify the empty state');

console.log(
  `Backlinks JSON check passed (${articleSlugs.length} articles: ${withLinks} with inbound links, ${withEmpty} with none; ground-truth + HTML/JSON parity verified)`,
);
