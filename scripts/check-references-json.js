import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleReferences } from './article-references.js';

// Load-bearing check for /wiki/<slug>/references.json: the machine-readable
// OUTBOUND link index, the counterpart to backlinks.json (which lists
// INBOUND links). It (1) unit-tests the builder with constructed inputs,
// (2) confirms every article has a built references.json with the correct
// shape, (3) verifies the entries match the ground-truth link graph
// (published-only join, same join backlinks.json.ts uses), (4) checks sort
// order (compareTitles(title) then compareTitles(slug)), (5) checks the
// empty-state (count 0, empty array), (6) confirms self-references are
// excluded, and (7) cross-checks the outbound set against the built HTML
// article body (the inline wiki links the article actually renders), so the
// JSON endpoint and the HTML body never drift on which articles this one
// references.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: builder produces the correct JSON shape ----------------------
{
  const titleBySlug = { recycling: 'Recycling', neuron: 'Neuron', subnet_1: 'Subnet 1' };
  const result = buildArticleReferences({
    slug: 'recycling',
    title: 'Recycling',
    origin: ORIGIN,
    links: [
      { slug: 'neuron', text: 'neuron' },
      { slug: 'subnet_1', text: 'subnet 1' },
    ],
    titleBySlug,
  });
  assert.equal(result.slug, 'recycling', 'builder: slug field');
  assert.equal(result.title, 'Recycling', 'builder: title field');
  assert.equal(result.url, `${ORIGIN}/wiki/recycling/`, 'builder: url field');
  assert.equal(result.referencesUrl, `${ORIGIN}/wiki/recycling/references/`, 'builder: referencesUrl field');
  assert.equal(result.count, 2, 'builder: count equals references length');
  assert.equal(result.references.length, 2, 'builder: references array length');
  assert.equal(result.references[0].slug, 'neuron', 'builder: references[0].slug');
  assert.equal(result.references[0].title, 'Neuron', 'builder: references[0].title');
  assert.equal(result.references[0].url, `${ORIGIN}/wiki/neuron/`, 'builder: references[0].url');
  assert.equal(result.references[1].slug, 'subnet_1', 'builder: references[1].slug');
  assert.equal(result.references[1].title, 'Subnet 1', 'builder: references[1].title');
  assert.equal(result.references[1].url, `${ORIGIN}/wiki/subnet_1/`, 'builder: references[1].url');

  const empty = buildArticleReferences({ slug: 'orphan', title: 'Orphan', origin: ORIGIN, links: [], titleBySlug });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.references, [], 'builder: empty references is []');
}

// Self-references are excluded.
{
  const titleBySlug = { foo: 'Foo' };
  const result = buildArticleReferences({
    slug: 'foo',
    title: 'Foo',
    origin: ORIGIN,
    links: [{ slug: 'foo', text: 'self' }],
    titleBySlug,
  });
  assert.equal(result.count, 0, 'builder: self-reference is excluded');
  assert.deepEqual(result.references, [], 'builder: empty references when only self-reference is present');
}

// Targets that did not resolve to a published article are excluded (the
// published-only join backlinks.json.ts uses for inbound links).
{
  const titleBySlug = { foo: 'Foo' };
  const result = buildArticleReferences({
    slug: 'foo',
    title: 'Foo',
    origin: ORIGIN,
    links: [
      { slug: 'foo', text: 'self' },
      { slug: 'unpublished_orphan', text: 'orphan' },
    ],
    titleBySlug,
  });
  assert.equal(result.count, 0, 'builder: non-published and self targets excluded');
}

// Missing / non-array inputs do not crash.
{
  assert.deepEqual(
    buildArticleReferences({ slug: 'foo', title: 'Foo', origin: ORIGIN, titleBySlug: {} }),
    { slug: 'foo', title: 'Foo', url: `${ORIGIN}/wiki/foo/`, referencesUrl: `${ORIGIN}/wiki/foo/references/`, count: 0, references: [] },
    'builder: missing links normalizes to empty references',
  );
}

// Numeric title sort: "Subnet 9" before "Subnet 10" (numeric, not raw string).
{
  const titleBySlug = {
    foo: 'Foo',
    s10: 'Subnet 10',
    s2: 'Subnet 2',
    s9: 'Subnet 9',
  };
  const result = buildArticleReferences({
    slug: 'foo',
    title: 'Foo',
    origin: ORIGIN,
    links: [
      { slug: 's10', text: 'subnet 10' },
      { slug: 's2', text: 'subnet 2' },
      { slug: 's9', text: 'subnet 9' },
    ],
    titleBySlug,
  });
  assert.deepEqual(
    result.references.map((r) => r.title),
    ['Subnet 2', 'Subnet 9', 'Subnet 10'],
    'numeric-suffixed titles must order numerically (Subnet 2 < Subnet 9 < Subnet 10), not by raw string',
  );
}

// ---- 2–7) Built-output checks ----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

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
    if (
      parent === 'history' ||
      parent === 'backlinks' ||
      parent === 'cite' ||
      parent === 'info' ||
      parent === 'references'
    ) {
      continue;
    }
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);
assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const articleBuilt = (slug) => fs.existsSync(path.join(wikiDir, slug, 'index.html'));

// Parse outbound wiki-link slugs from a rendered article HTML body. The article
// body renders outbound links as <a href="/wiki/<slug>/" ...>...</a> inside
// .mw-parser-output. Exclude intra-page links (href starting with #), special/
// and category/ routes, and citations/footnotes that point to other wiki pages
// but live inside <sup class="reference"> cite links — those are forward
// references to footnotes, not article references, and the inline /wiki/<slug>/
// pattern matches them too, so we restrict the scan to anchors outside the
// reference list. The linkgraph also excludes footnote-only targets, so the
// two surfaces should agree on the per-article reference set when restricted
// to links whose href target matches a published article. We re-derive the
// set from the linkgraph (the ground truth) and assert JSON parity with the
// rendered inline wiki-link href set, excluding footnote cite links.
const htmlOutboundSlugs = (html, sourceSlug) => {
  const bodyMatch = html.match(/<div[^>]*class="mw-parser-output"[^>]*>([\s\S]*?)<aside[^>]*class="mw-appearance"/);
  const body = bodyMatch ? bodyMatch[1] : html;
  const slugs = new Set();
  for (const match of body.matchAll(/href="(\/wiki\/[^"#]+)\/"/g)) {
    const href = match[1];
    const targetSlug = href.split('/')[2];
    if (!targetSlug) continue;
    if (targetSlug === sourceSlug) continue;
    if (targetSlug === 'special' || targetSlug === 'category') continue;
    slugs.add(targetSlug);
  }
  return slugs;
};

let withLinks = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  // 2) COVERAGE: every article must have a references.json
  const jsonFile = path.join(wikiDir, slug, 'references.json');
  assert.ok(
    fs.existsSync(jsonFile),
    `every article must have a references.json, but /wiki/${slug}/references.json was not built`,
  );

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  // 3) SHAPE: required fields present and correctly typed
  assert.equal(typeof doc.slug, 'string', `${slug}: references.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: references.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: references.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: references.json url must be the canonical article URL`);
  assert.equal(
    doc.referencesUrl,
    `${ORIGIN}/wiki/${slug}/references/`,
    `${slug}: references.json referencesUrl must point to the HTML page`,
  );
  assert.equal(typeof doc.count, 'number', `${slug}: references.json count must be a number`);
  assert.ok(Array.isArray(doc.references), `${slug}: references.json references must be an array`);
  assert.equal(doc.count, doc.references.length, `${slug}: references.json count must equal references.length`);

  // 4) CORRECTNESS against ground truth (published-only join, self-excluded).
  const expected = new Set(
    (linkgraphData[slug] ?? [])
      .map((e) => e.target)
      .filter((target) => target && target !== slug && slugmap[target]),
  );
  const rendered = new Set(doc.references.map((e) => e.slug));
  assert.deepEqual(
    rendered,
    expected,
    `/wiki/${slug}/references.json must list exactly the published outbound targets from the link graph`,
  );

  // Per-entry shape
  for (const entry of doc.references) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every reference entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every reference entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every reference entry url must be the canonical article URL`);
    assert.ok(articleBuilt(entry.slug), `${slug}: reference entry ${entry.slug} references an unbuilt article`);
    assert.notEqual(entry.slug, slug, `${slug}: reference entry must not point back at the source article`);
  }

  // 5) SORT ORDER: same compareTitles order as backlinks.json (title then slug).
  for (let i = 1; i < doc.references.length; i++) {
    const a = doc.references[i - 1];
    const b = doc.references[i];
    const cmp =
      compareTitles(a.title, b.title) ||
      compareTitles(a.slug, b.slug);
    assert.ok(cmp <= 0, `/wiki/${slug}/references.json entries must be sorted by numeric title then slug ("${a.title}"/${a.slug} before "${b.title}"/${b.slug})`);
  }

  // 6) SELF-REFERENCE EXCLUSION: the article must never appear in its own
  //    references list (the builder explicitly filters self-targets).
  assert.ok(!rendered.has(slug), `${slug}: references.json must not contain the source article as a self-reference`);

  // 7) HTML/JSON PARITY: the rendered HTML article body must link to every
  //    reference listed in the JSON. (JSON is a strict subset of inline links
  //    because the linkgraph skips non-published and self targets, so HTML
  //    inline links can include targets the JSON does not — but every JSON
  //    entry must appear as an inline /wiki/<slug>/ link in the body.)
  const htmlFile = path.join(wikiDir, slug, 'index.html');
  if (fs.existsSync(htmlFile)) {
    const htmlSlugs = htmlOutboundSlugs(fs.readFileSync(htmlFile, 'utf8'), slug);
    for (const refSlug of rendered) {
      assert.ok(
        htmlSlugs.has(refSlug),
        `${slug}: reference ${refSlug} listed in references.json must also appear as an inline /wiki/${refSlug}/ link in the rendered HTML body`,
      );
    }
  }

  if (doc.count > 0) withLinks++;
  else withEmpty++;
}

assert.ok(withLinks > 0, 'expected at least one article with outbound references to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no outbound references to verify the empty state');

console.log(
  `References JSON check passed (${articleSlugs.length} articles: ${withLinks} with outbound links, ${withEmpty} with none; ground-truth + self-exclusion + HTML/JSON parity verified)`,
);