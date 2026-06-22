import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { buildArticleReferences, getArticleReferences } from '../src/lib/article-references.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: helper and builder behavior ---------------------------------
{
  const titleBySlug = {
    alpha: 'Subnet 2',
    beta: 'Subnet 10',
    gamma: 'Subnet 9',
    delta: 'Delta',
  };
  const linkGraph = {
    source: [
      { target: 'source' },
      { target: 'beta' },
      { target: 'gamma' },
      { target: 'alpha' },
      { target: 'alpha' },
      { target: 'missing' },
      { target: 'delta' },
    ],
  };

  const references = getArticleReferences({ slug: 'source', linkGraph, titleBySlug });
  assert.deepEqual(
    references,
    [
      { slug: 'delta', title: 'Delta' },
      { slug: 'alpha', title: 'Subnet 2' },
      { slug: 'gamma', title: 'Subnet 9' },
      { slug: 'beta', title: 'Subnet 10' },
    ],
    'helper must exclude self/missing targets, dedupe repeated targets, and sort numerically by title',
  );

  const doc = buildArticleReferences({ slug: 'source', title: 'Source', origin: ORIGIN, references });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.referencesUrl, `${ORIGIN}/wiki/source/references.json`, 'builder: referencesUrl self field');
  assert.equal(doc.count, 4, 'builder: count field');
  assert.deepEqual(
    doc.references,
    [
      {
        slug: 'delta',
        title: 'Delta',
        url: `${ORIGIN}/wiki/delta/`,
        historyUrl: `${ORIGIN}/wiki/delta/history/`,
      },
      {
        slug: 'alpha',
        title: 'Subnet 2',
        url: `${ORIGIN}/wiki/alpha/`,
        historyUrl: `${ORIGIN}/wiki/alpha/history/`,
      },
      {
        slug: 'gamma',
        title: 'Subnet 9',
        url: `${ORIGIN}/wiki/gamma/`,
        historyUrl: `${ORIGIN}/wiki/gamma/history/`,
      },
      {
        slug: 'beta',
        title: 'Subnet 10',
        url: `${ORIGIN}/wiki/beta/`,
        historyUrl: `${ORIGIN}/wiki/beta/history/`,
      },
    ],
    'builder: reference entry shape',
  );

  const empty = buildArticleReferences({ slug: 'orphan', title: 'Orphan', origin: ORIGIN });
  assert.equal(empty.count, 0, 'builder: empty count is 0');
  assert.deepEqual(empty.references, [], 'builder: empty references is []');
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const linkgraphData = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, meta]) => [slug, typeof meta?.title === 'string' ? meta.title : slug]),
);
const expectedReferencesFor = (slug) => {
  const links = Array.isArray(linkgraphData[slug]) ? linkgraphData[slug] : [];
  const seen = new Set();
  const references = [];

  for (const link of links) {
    const target = typeof link?.target === 'string' ? link.target : '';
    if (!target || target === slug || !titleBySlug[target] || seen.has(target)) continue;

    seen.add(target);
    references.push({ slug: target, title: titleBySlug[target] });
  }

  return references.sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
};

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

let withReferences = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'references.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a references.json, but /wiki/${slug}/references.json was not built`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const expectedReferences = expectedReferencesFor(slug);

  assert.equal(typeof doc.slug, 'string', `${slug}: references.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: references.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: references.json slug must equal the article slug`);
  assert.equal(doc.title, titleBySlug[slug], `${slug}: references.json title must equal the published article title`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: references.json url must be the canonical article URL`);
  assert.equal(
    doc.referencesUrl,
    `${ORIGIN}/wiki/${slug}/references.json`,
    `${slug}: references.json must expose its own canonical referencesUrl`,
  );
  assert.equal(typeof doc.count, 'number', `${slug}: references.json count must be a number`);
  assert.ok(Array.isArray(doc.references), `${slug}: references.json references must be an array`);
  assert.equal(doc.count, doc.references.length, `${slug}: references.json count must equal references.length`);

  const actualReferences = doc.references.map((entry) => ({
    slug: entry.slug,
    title: entry.title,
  }));
  assert.deepEqual(
    actualReferences,
    expectedReferences,
    `/wiki/${slug}/references.json must list exactly the published outbound references from the link graph`,
  );

  for (const entry of doc.references) {
    assert.equal(typeof entry.slug, 'string', `${slug}: every reference entry must have a slug`);
    assert.equal(typeof entry.title, 'string', `${slug}: every reference entry must have a title`);
    assert.equal(entry.url, `${ORIGIN}/wiki/${entry.slug}/`, `${slug}: every reference entry url must be the canonical article URL`);
    assert.equal(
      entry.historyUrl,
      `${ORIGIN}/wiki/${entry.slug}/history/`,
      `${slug}: every reference entry historyUrl must be the canonical article history URL`,
    );
  }

  if (doc.count > 0) withReferences++;
  else withEmpty++;
}

assert.ok(withReferences > 0, 'expected at least one article with outbound references to verify correctness');
assert.ok(withEmpty > 0, 'expected at least one article with no outbound references to verify the empty state');

console.log(
  `References JSON check passed (${articleSlugs.length} articles: ${withReferences} with outbound references, ${withEmpty} with none; ground-truth parity verified)`,
);
