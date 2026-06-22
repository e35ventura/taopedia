import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArticleSummary } from '../src/lib/article-summary.js';

// Load-bearing check for the per-article summary.json endpoint. It pins the
// builder's Wikipedia REST `/page/summary/` shape (unit) and then verifies every
// built article ships a summary.json whose content matches the same frontmatter
// the article page renders (title, summary, categories), the advertised OG
// thumbnail, and the newest revision date from the build-time history.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const historyDir = path.join(projectRoot, 'public', 'history');
const ORIGIN = 'https://taopedia.org';
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

// ---- 1) Unit: builder shape + edge cases ----------------------------------
{
  const doc = buildArticleSummary({
    slug: 'source',
    title: 'Source',
    origin: ORIGIN,
    summary: '  A short lede.  ',
    categories: ['Subnets', 'Consensus'],
    timestamp: '2026-06-21T10:53:45.000Z',
  });

  assert.equal(doc.type, 'standard', 'builder: type is "standard" (REST summary contract)');
  assert.equal(doc.title, 'Source', 'builder: title field');
  assert.equal(doc.displaytitle, 'Source', 'builder: displaytitle field');
  assert.equal(doc.slug, 'source', 'builder: slug field');
  assert.deepEqual(
    doc.titles,
    { canonical: 'source', normalized: 'Source', display: 'Source' },
    'builder: titles canonical/normalized/display',
  );
  assert.equal(doc.lang, 'en', 'builder: lang field');
  assert.equal(doc.dir, 'ltr', 'builder: dir field');
  assert.equal(doc.timestamp, '2026-06-21T10:53:45.000Z', 'builder: timestamp field');
  assert.equal(doc.extract, 'A short lede.', 'builder: extract is the trimmed summary');
  assert.deepEqual(doc.categories, ['Subnets', 'Consensus'], 'builder: categories field');
  assert.deepEqual(
    doc.thumbnail,
    { source: `${ORIGIN}/og/source.png`, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
    'builder: thumbnail mirrors the per-article OG card',
  );
  assert.equal(doc.url, `${ORIGIN}/wiki/source/`, 'builder: url is the canonical article URL');
  assert.equal(doc.summaryJsonUrl, `${ORIGIN}/wiki/source/summary.json`, 'builder: self canonical summaryJsonUrl');
  assert.deepEqual(
    doc.content_urls,
    { desktop: { page: `${ORIGIN}/wiki/source/`, revisions: `${ORIGIN}/wiki/source/history/` } },
    'builder: content_urls exposes the article and its revision list',
  );

  // The builder must not alias the caller's categories array.
  const cats = ['One'];
  const aliasing = buildArticleSummary({ slug: 's', title: 'S', origin: ORIGIN, categories: cats });
  aliasing.categories.push('Two');
  assert.deepEqual(cats, ['One'], 'builder: categories are copied, not aliased');

  // Missing summary -> empty extract (the article shows no summary block then).
  const noSummary = buildArticleSummary({ slug: 'bare', title: 'Bare', origin: ORIGIN });
  assert.equal(noSummary.extract, '', 'builder: absent summary yields an empty extract');
  assert.deepEqual(noSummary.categories, [], 'builder: absent categories yields an empty array');

  // Missing/blank timestamp -> null (no invented date).
  assert.equal(noSummary.timestamp, null, 'builder: absent timestamp is null');
  const blankTs = buildArticleSummary({ slug: 's', title: 'S', origin: ORIGIN, timestamp: '' });
  assert.equal(blankTs.timestamp, null, 'builder: blank timestamp normalizes to null');
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

// Newest commit date for an article, mirroring lib/article-history lastmodForSlug.
const lastmodForSlug = (slug) => {
  const historyFile = path.join(historyDir, `${slug}.json`);
  if (!fs.existsSync(historyFile)) return null;
  const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  const date = Array.isArray(data?.history) ? data.history[0]?.date : null;
  return typeof date === 'string' && date ? date : null;
};

// Collect built article slugs the same way the references/related checks do:
// every dist/wiki/**/index.html that is not a special/category page or an HTML
// sub-page (history/backlinks/cite/info).
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

let withExtract = 0;
let withTimestamp = 0;

for (const slug of articleSlugs) {
  const jsonFile = path.join(wikiDir, slug, 'summary.json');
  assert.ok(fs.existsSync(jsonFile), `every article must have a summary.json, but /wiki/${slug}/summary.json was not built`);

  const meta = slugmap[slug] ?? {};
  const expectedTitle = typeof meta.title === 'string' ? meta.title : slug;
  const expectedExtract = typeof meta.summary === 'string' ? meta.summary.trim() : '';
  const expectedCategories = Array.isArray(meta.categories) ? meta.categories : [];
  const expectedTimestamp = lastmodForSlug(slug);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  assert.equal(doc.type, 'standard', `${slug}: summary.json type must be "standard"`);
  assert.equal(doc.slug, slug, `${slug}: summary.json slug must equal the article slug`);
  assert.equal(doc.title, expectedTitle, `${slug}: summary.json title must equal the published article title`);
  assert.equal(doc.displaytitle, expectedTitle, `${slug}: summary.json displaytitle must equal the title`);
  assert.deepEqual(
    doc.titles,
    { canonical: slug, normalized: expectedTitle, display: expectedTitle },
    `${slug}: summary.json titles must expose canonical/normalized/display`,
  );
  assert.equal(doc.lang, 'en', `${slug}: summary.json lang must be "en"`);
  assert.equal(doc.dir, 'ltr', `${slug}: summary.json dir must be "ltr"`);
  assert.equal(
    doc.extract,
    expectedExtract,
    `${slug}: summary.json extract must equal the article's frontmatter summary`,
  );
  assert.deepEqual(
    doc.categories,
    expectedCategories,
    `${slug}: summary.json categories must equal the article's frontmatter categories`,
  );
  assert.deepEqual(
    doc.thumbnail,
    { source: `${ORIGIN}/og/${slug}.png`, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
    `${slug}: summary.json thumbnail must mirror the per-article OG card`,
  );
  // The advertised thumbnail must be a real built asset, not a dangling URL.
  assert.ok(
    fs.existsSync(path.join(distDir, 'og', `${slug}.png`)),
    `${slug}: summary.json thumbnail points at /og/${slug}.png, which was not built`,
  );
  assert.equal(doc.url, `${ORIGIN}/wiki/${slug}/`, `${slug}: summary.json url must be the canonical article URL`);
  assert.equal(
    doc.summaryJsonUrl,
    `${ORIGIN}/wiki/${slug}/summary.json`,
    `${slug}: summary.json must expose its own canonical summaryJsonUrl`,
  );
  assert.deepEqual(
    doc.content_urls,
    { desktop: { page: `${ORIGIN}/wiki/${slug}/`, revisions: `${ORIGIN}/wiki/${slug}/history/` } },
    `${slug}: summary.json content_urls must point at the article and its history`,
  );
  assert.equal(
    doc.timestamp,
    expectedTimestamp,
    `${slug}: summary.json timestamp must equal the newest revision date (or null)`,
  );

  if (doc.extract.length > 0) withExtract++;
  if (doc.timestamp) withTimestamp++;
}

assert.ok(withExtract > 0, 'expected at least one article with a non-empty extract to verify content parity');
assert.ok(withTimestamp > 0, 'expected at least one article with a last-modified timestamp to verify date parity');

console.log(
  `Summary JSON check passed (${articleSlugs.length} articles: ${withExtract} with an extract, ${withTimestamp} with a last-modified date; REST /page/summary shape + frontmatter/OG/history parity verified)`,
);
