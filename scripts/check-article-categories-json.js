import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

// /wiki/<slug>/categories.json exposes the per-article category membership list
// as structured JSON. The contract: site is a URL string; slug, title, url, and
// count are present; categories is an array sorted alphabetically; each entry
// carries name and url (encoded with encodeURIComponent); count equals
// categories.length; and every listed category URL points at a built category
// hub. Articles that belong to no categories carry count: 0 and an empty
// array — that is valid, not an error.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const slugmapPath = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapPath), 'public/data/slugmap.json not found; run the build first');

const slugmap = JSON.parse(fs.readFileSync(slugmapPath, 'utf8'));

// ---- 0) Unit: URL encoding handles URL-sensitive category names -----------
// Verify that the URL construction strategy used in categories.json.ts is
// safe for category names that contain URL-reserved characters.
{
  const sensitiveName = 'Proof-of-Work/Tokens & #Mining?v=2';
  const catSlug = sensitiveName.replace(/ /g, '_');
  const encoded = encodeURIComponent(catSlug);
  assert.ok(
    !/[/?#&%]/.test(encoded.replace(/%[0-9A-F]{2}/gi, '')),
    `encodeURIComponent must eliminate bare URL-reserved characters from category slugs (got ${encoded})`,
  );
  assert.doesNotThrow(
    () => new URL(`https://taopedia.org/wiki/category/${encoded}/`),
    'encodeURIComponent(categorySlug(name)) must produce a valid URL path segment',
  );
  assert.equal(
    decodeURIComponent(encoded),
    catSlug,
    'decodeURIComponent(encodeURIComponent(categorySlug(name))) must round-trip correctly',
  );
}

// ---- 1) Unit: well-known article with multiple categories ------------------
// 'stake' belongs to 'Consensus' and 'Staking' per slugmap.json — two categories,
// so the count and sorted order can be independently verified.
const stakeFile = path.join(wikiDir, 'stake', 'categories.json');
assert.ok(fs.existsSync(stakeFile), 'dist/wiki/stake/categories.json not found; run the build first');

{
  const doc = JSON.parse(fs.readFileSync(stakeFile, 'utf8'));

  assert.ok(
    typeof doc.site === 'string' && /^https?:\/\//.test(doc.site),
    `stake/categories.json: site must be an https URL (got ${JSON.stringify(doc.site)})`,
  );
  assert.equal(doc.slug, 'stake', 'stake/categories.json: slug must be "stake"');
  assert.ok(typeof doc.title === 'string' && doc.title, 'stake/categories.json: title must be a non-empty string');
  assert.ok(
    typeof doc.url === 'string' && doc.url.includes('/wiki/stake/'),
    'stake/categories.json: url must include /wiki/stake/',
  );
  assert.equal(
    doc.url,
    `${doc.site}/wiki/${encodeURIComponent('stake')}/`,
    'stake/categories.json: url must use encodeURIComponent(slug)',
  );
  assert.equal(typeof doc.count, 'number', 'stake/categories.json: count must be a number');
  assert.ok(Array.isArray(doc.categories), 'stake/categories.json: categories must be an array');
  assert.equal(doc.count, doc.categories.length, 'stake/categories.json: count must equal categories.length');

  // Verify count against the ground-truth slugmap entry.
  const expectedNames = [...new Set(slugmap['stake']?.categories ?? [])].sort(compareTitles);
  assert.equal(doc.count, expectedNames.length, `stake/categories.json: count must match slugmap (expected ${expectedNames.length})`);

  // Verify sorted order matches compareTitles.
  const docNames = doc.categories.map((c) => c.name);
  assert.deepEqual(docNames, expectedNames, 'stake/categories.json: categories must be sorted by compareTitles');

  // Per-entry field shape and URL encoding.
  for (const cat of doc.categories) {
    assert.ok(typeof cat.name === 'string' && cat.name, 'stake/categories.json: each category must have a name');
    assert.ok(
      typeof cat.url === 'string' && cat.url.includes('/wiki/category/'),
      `stake/categories.json: ${cat.name} url must include /wiki/category/`,
    );
    const expectedCatUrl = `${doc.site}/wiki/category/${encodeURIComponent(cat.name.replace(/ /g, '_'))}/`;
    assert.equal(
      cat.url,
      expectedCatUrl,
      `stake/categories.json: ${cat.name} url must use encodeURIComponent(categorySlug)`,
    );
  }
}

// ---- 2) Built-output spot check: sample the first 20 article dirs ---------
const articleDirs = fs
  .readdirSync(wikiDir)
  .filter((entry) => {
    const full = path.join(wikiDir, entry);
    return (
      fs.statSync(full).isDirectory()
      && fs.existsSync(path.join(full, 'index.html'))
      && fs.existsSync(path.join(full, 'categories.json'))
    );
  })
  .slice(0, 20);

assert.ok(articleDirs.length > 0, 'No article directories with categories.json found; run the build first');

for (const slug of articleDirs) {
  const filePath = path.join(wikiDir, slug, 'categories.json');
  const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(doc.slug, slug, `${slug}/categories.json: slug must equal directory name`);
  assert.ok(typeof doc.title === 'string' && doc.title, `${slug}/categories.json: title must be non-empty`);
  assert.ok(
    typeof doc.count === 'number' && doc.count >= 0,
    `${slug}/categories.json: count must be a non-negative number`,
  );
  assert.ok(Array.isArray(doc.categories), `${slug}/categories.json: categories must be an array`);
  assert.equal(doc.count, doc.categories.length, `${slug}/categories.json: count must equal categories.length`);

  // URL encoding contract for the article URL.
  assert.equal(
    doc.url,
    `${doc.site}/wiki/${encodeURIComponent(slug)}/`,
    `${slug}/categories.json: url must use encodeURIComponent(slug)`,
  );

  // Alphabetical order check with compareTitles.
  for (let i = 1; i < doc.categories.length; i++) {
    const prev = doc.categories[i - 1];
    const cur = doc.categories[i];
    assert.ok(
      compareTitles(prev.name, cur.name) <= 0,
      `${slug}/categories.json: categories must be sorted alphabetically (${prev.name} > ${cur.name})`,
    );
  }

  // Count must match the deduplicated slugmap entry.
  const expected = [...new Set(slugmap[slug]?.categories ?? [])].length;
  assert.equal(doc.count, expected, `${slug}/categories.json: count must match deduplicated slugmap entry (expected ${expected})`);
}

console.log(`article categories.json check passed (spot-checked ${articleDirs.length} articles)`);
