import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

// /wiki/special/longpages.json lists all published articles ranked by word
// count, longest first — the inverse of /wiki/special/shortpages.json. The
// contract: site is a URL string; count equals pages.length; each entry
// carries slug, title, url (absolute, matching site), and words (non-negative
// integer); entries are sorted words-descending with compareTitles tiebreak;
// and the ranking agrees with a word count re-derived from source article files.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'longpages.json');
const pagesDir = path.join(projectRoot, 'src', 'content', 'pages');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/longpages.json not found; run the build first');
assert.ok(fs.existsSync(pagesDir), 'src/content/pages not found');

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));

// ---- 1) Envelope shape --------------------------------------------------
assert.ok(
  typeof data.site === 'string' && /^https?:\/\//.test(data.site),
  `site must be an https URL (got ${JSON.stringify(data.site)})`,
);
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.ok(data.pages.length > 0, 'longpages.json must list at least one article');

// ---- 2) Per-entry field shape -------------------------------------------
for (const row of data.pages) {
  assert.ok(typeof row.slug === 'string' && row.slug, `each entry must have a slug (got ${JSON.stringify(row.slug)})`);
  assert.ok(typeof row.title === 'string' && row.title, `${row.slug}: title must be a non-empty string`);
  assert.ok(
    typeof row.url === 'string' && row.url.startsWith(`${data.site}/wiki/`),
    `${row.slug}: url must be absolute and start with the envelope site`,
  );
  assert.equal(row.url, `${data.site}/wiki/${row.slug}/`, `${row.slug}: url must equal ${data.site}/wiki/${row.slug}/`);
  assert.ok(
    Number.isInteger(row.words) && row.words >= 0,
    `${row.slug}: words must be a non-negative integer (got ${JSON.stringify(row.words)})`,
  );
}

// ---- 3) Sort order: descending by words, tiebreak by compareTitles ------
for (let i = 1; i < data.pages.length; i++) {
  const prev = data.pages[i - 1];
  const cur = data.pages[i];
  const wordOk = prev.words >= cur.words;
  const tieOk =
    prev.words !== cur.words ||
    compareTitles(prev.title, cur.title) <= 0 ||
    (compareTitles(prev.title, cur.title) === 0 && compareTitles(prev.slug, cur.slug) <= 0);
  assert.ok(
    wordOk && tieOk,
    `entries must be sorted words-descending with compareTitles tiebreak (row ${i - 1}: ${prev.slug}=${prev.words} < row ${i}: ${cur.slug}=${cur.words})`,
  );
}

// ---- 4) Ground-truth word count from source files -----------------------
const slugDirs = fs.readdirSync(pagesDir).filter((d) => {
  const full = path.join(pagesDir, d);
  return fs.statSync(full).isDirectory();
});

const sourceWordCounts = {};
for (const slug of slugDirs) {
  for (const ext of ['index.mdx', 'index.md']) {
    const file = path.join(pagesDir, slug, ext);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/m, '');
    sourceWordCounts[slug] = body.trim().split(/\s+/).filter(Boolean).length;
    break;
  }
}

for (const row of data.pages) {
  if (!(row.slug in sourceWordCounts)) continue;
  assert.equal(
    row.words,
    sourceWordCounts[row.slug],
    `${row.slug}: built word count (${row.words}) must match source file word count (${sourceWordCounts[row.slug]})`,
  );
}

// ---- 5) All source slugs appear in the output ---------------------------
const builtSlugs = new Set(data.pages.map((p) => p.slug));
const missingSlugs = slugDirs.filter((s) => s in sourceWordCounts && !builtSlugs.has(s));
assert.equal(
  missingSlugs.length,
  0,
  `longpages.json is missing ${missingSlugs.length} article(s): ${missingSlugs.slice(0, 5).join(', ')}`,
);

const longest = data.pages[0];
console.log(
  `longpages.json check passed (${data.count} articles, longest="${longest.title}" at ${longest.words} words)`,
);
