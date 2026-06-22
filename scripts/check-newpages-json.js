import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

// /wiki/special/newpages.json exposes newly-created articles as structured JSON,
// sorted by creation date (oldest revision) newest-first. The contract is:
// – site matches the build origin; count equals pages.length
// – every entry carries slug, title, url, and created (ISO 8601 date string)
// – url uses the absolute origin + /wiki/<slug>/ form
// – pages are ordered newest-created first with compareTitles slug tiebreak
// – every slug corresponds to a built article (no orphaned history files)
// – every created date is a valid date string drawn from the real history data

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const distFile = path.join(wikiDir, 'special', 'newpages.json');
const historyDir = path.join(projectRoot, 'public', 'history');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/newpages.json not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');

const doc = JSON.parse(fs.readFileSync(distFile, 'utf8'));

// ---- 1) Top-level shape ---------------------------------------------------
assert.ok(
  typeof doc.site === 'string' && /^https?:\/\//.test(doc.site),
  `newpages.json: site must be an https URL (got ${JSON.stringify(doc.site)})`,
);
assert.equal(typeof doc.count, 'number', 'newpages.json: count must be a number');
assert.ok(Array.isArray(doc.pages), 'newpages.json: pages must be an array');
assert.equal(doc.count, doc.pages.length, 'newpages.json: count must equal pages.length');
assert.ok(doc.pages.length > 0, 'newpages.json: pages must not be empty');

// ---- 2) Per-entry field contract ------------------------------------------
for (const entry of doc.pages) {
  assert.ok(typeof entry.slug === 'string' && entry.slug, `newpages.json: every entry must carry a slug`);
  assert.ok(typeof entry.title === 'string' && entry.title, `newpages.json: every entry must carry a title`);
  assert.ok(typeof entry.url === 'string', `newpages.json: every entry must carry a url`);
  assert.ok(typeof entry.created === 'string', `newpages.json: every entry must carry a created date`);
  // URL must be absolute and must contain the slug.
  assert.ok(
    entry.url.startsWith(doc.site),
    `newpages.json: entry url must start with the site origin (${entry.slug})`,
  );
  assert.ok(
    entry.url.includes(`/wiki/${entry.slug}/`),
    `newpages.json: entry url must include the article path (${entry.slug})`,
  );
  // Created must be a valid ISO 8601 date string.
  assert.ok(
    !Number.isNaN(Date.parse(entry.created)),
    `newpages.json: entry has an invalid created date: ${entry.created} (${entry.slug})`,
  );
  // Every slug must correspond to a built article page.
  assert.ok(
    fs.existsSync(path.join(wikiDir, entry.slug, 'index.html')),
    `newpages.json: entry links to /wiki/${entry.slug}/ but no such article page was built (orphaned history must be excluded)`,
  );
}

// ---- 3) Ordering: newest-created first, compareTitles slug tiebreak -------
for (let i = 1; i < doc.pages.length; i++) {
  const prev = doc.pages[i - 1];
  const cur = doc.pages[i];
  assert.ok(
    prev.created >= cur.created,
    `newpages.json: pages must be sorted newest-created first (row ${i - 1} ${prev.created} < row ${i} ${cur.created})`,
  );
  if (prev.created === cur.created) {
    assert.ok(
      compareTitles(prev.slug, cur.slug) <= 0,
      `newpages.json: same-date entries must be ordered by compareTitles (numeric): ${prev.slug} > ${cur.slug} at ${cur.created}`,
    );
  }
}

// ---- 4) Ground truth: every published article with a creation date must appear ----
const slugsInDoc = new Set(doc.pages.map((p) => p.slug));
let expectedCount = 0;
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const slug = file.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(wikiDir, slug, 'index.html'))) continue; // unpublished
  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history ?? [];
  const oldest = history[history.length - 1];
  if (typeof oldest?.date !== 'string' || !oldest.date) continue; // no dated entry
  expectedCount++;
  assert.ok(slugsInDoc.has(slug), `newpages.json: published article ${slug} with a creation date is missing from the list`);
}
assert.equal(
  doc.count,
  expectedCount,
  `newpages.json: count must equal the number of published articles with a creation date (expected ${expectedCount}, got ${doc.count})`,
);

console.log(`newpages.json check passed (${doc.count} articles)`);
