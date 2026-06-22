import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleToc, getArticleToc } from '../src/lib/article-toc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: helper + builder behavior -----------------------------------
{
  const sections = getArticleToc([
    { depth: 1, slug: 'top', text: 'Top' },
    { depth: 2, slug: 'alpha', text: 'Alpha' },
    { depth: 3, slug: 'beta', text: 'Beta' },
    { depth: 4, slug: 'gamma', text: 'Gamma' },
    { depth: 5, slug: 'ignored', text: 'Ignored' },
  ]);
  assert.deepEqual(
    sections,
    [
      { number: 1, depth: 2, slug: 'alpha', title: 'Alpha' },
      { number: 2, depth: 3, slug: 'beta', title: 'Beta' },
      { number: 3, depth: 4, slug: 'gamma', title: 'Gamma' },
    ],
    'helper must keep only visible TOC heading depths, preserve order, and assign sequential numbers',
  );

  assert.deepEqual(
    getArticleToc([{ depth: 2, slug: 'solo', text: 'Solo' }]),
    [],
    'helper must return an empty TOC when the article would not render a multi-entry contents block',
  );

  const doc = buildArticleToc({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    sections,
  });
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url field');
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.sections,
    [
      { number: 1, depth: 2, slug: 'alpha', title: 'Alpha', url: `${ORIGIN}/wiki/source/#alpha` },
      { number: 2, depth: 3, slug: 'beta', title: 'Beta', url: `${ORIGIN}/wiki/source/#beta` },
      { number: 3, depth: 4, slug: 'gamma', title: 'Gamma', url: `${ORIGIN}/wiki/source/#gamma` },
    ],
    'builder: section entry shape',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

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

const parseRenderedToc = (html) =>
  [...html.matchAll(/<li class="toc-level-(\d+)[^"]*"[^>]*data-toc-level="(\d+)"[^>]*>[\s\S]*?<a href="#([^"]+)"[^>]*>[\s\S]*?<span class="toc-number">(\d+)<\/span>\s*([^<]+?)\s*<\/a>/g)].map(
    (match) => ({
      depth: Number(match[2]),
      classDepth: Number(match[1]),
      slug: match[3],
      number: Number(match[4]),
      title: match[5].trim(),
    }),
  );

let withToc = 0;
let withEmpty = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'toc.json');
  const htmlFile = path.join(wikiDir, slug, 'index.html');
  assert.ok(fs.existsSync(jsonFile), `every article must have a toc.json, but /wiki/${slug}/toc.json was not built`);
  assert.ok(fs.existsSync(htmlFile), `missing built article page: /wiki/${slug}/`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const html = fs.readFileSync(htmlFile, 'utf8');
  const htmlSections = parseRenderedToc(html);

  assert.equal(typeof doc.slug, 'string', `${slug}: toc.json slug must be a string`);
  assert.equal(typeof doc.title, 'string', `${slug}: toc.json title must be a string`);
  assert.equal(doc.slug, slug, `${slug}: toc.json slug must equal the article slug`);
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: toc.json url must be the canonical article URL`);
  assert.equal(typeof doc.count, 'number', `${slug}: toc.json count must be a number`);
  assert.ok(Array.isArray(doc.sections), `${slug}: toc.json sections must be an array`);
  assert.equal(doc.count, doc.sections.length, `${slug}: toc.json count must equal sections.length`);

  const normalizedHtmlSections = htmlSections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${ORIGIN}/wiki/${slug}/#${section.slug}`,
  }));

  assert.deepEqual(
    doc.sections,
    normalizedHtmlSections,
    `${slug}: toc.json sections must match the rendered contents sidebar exactly`,
  );

  for (const section of doc.sections) {
    assert.equal(typeof section.number, 'number', `${slug}: every TOC section must expose a numeric number`);
    assert.equal(typeof section.depth, 'number', `${slug}: every TOC section must expose a numeric depth`);
    assert.equal(typeof section.slug, 'string', `${slug}: every TOC section must expose a slug`);
    assert.equal(typeof section.title, 'string', `${slug}: every TOC section must expose a title`);
    assert.equal(
      section.url,
      `${ORIGIN}/wiki/${slug}/#${section.slug}`,
      `${slug}: every TOC section url must deep-link to its article heading`,
    );
    assert.ok(section.depth >= 2 && section.depth <= 4, `${slug}: TOC depth must stay within the rendered 2..4 range`);
  }

  if (doc.count > 0) withToc++;
  else withEmpty++;
}

assert.ok(withToc > 0, 'expected at least one article with a rendered contents sidebar');
assert.ok(withEmpty > 0, 'expected at least one article without a rendered contents sidebar');

console.log(
  `TOC JSON check passed (${articleSlugs.length} articles: ${withToc} with a contents sidebar, ${withEmpty} without; HTML-order parity verified)`,
);
