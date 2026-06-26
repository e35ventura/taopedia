import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';
import { RECENT_LIMIT } from '../src/lib/recent-changes.js';
import { isBuiltWikiArticleHref, slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const rcFile = path.join(wikiDir, 'special', 'recentchanges', 'index.html');
const historyDir = path.join(projectRoot, 'public', 'history');

assert.ok(fs.existsSync(rcFile), 'dist/wiki/special/recentchanges/index.html not found; run the build first');
const html = fs.readFileSync(rcFile, 'utf8');

// Parse the rendered rows: each <li class="mw-rc-row"> carries a <time
// datetime>, a title link, and a history link. Match the <li> elements
// specifically so the `.mw-rc-row` selector in the <style> block isn't counted.
const rows = [...html.matchAll(/<li[^>]*class="mw-rc-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  datetime: (block.match(/datetime="([^"]+)"/) || [])[1],
  titleHref: (block.match(/mw-rc-title[^>]*href="([^"]+)"/) || [])[1],
  histHref: (block.match(/mw-rc-hist[^>]*href="([^"]+)"/) || [])[1],
}));

assert.ok(rows.length > 0, 'recent changes page must render at least one change row');
assert.ok(rows.length <= RECENT_LIMIT, `recent changes must show at most ${RECENT_LIMIT} rows (got ${rows.length})`);

// Every row must have a valid date, a resolvable article link, and a history link.
for (const row of rows) {
  assert.ok(row.datetime && !Number.isNaN(Date.parse(row.datetime)), `row has an invalid date: ${row.datetime}`);
  assert.ok(isBuiltWikiArticleHref(row.titleHref || ''), `row has a malformed article link: ${row.titleHref}`);
  const slug = slugFromWikiHref(row.titleHref);
  assert.ok(
    fs.existsSync(path.join(wikiDir, slug, 'index.html')),
    `recent change links to /wiki/${slug}/ but no such article page was built (orphaned history must be skipped)`,
  );
  assert.equal(row.histHref, `/wiki/${slug}/history/`, `row history link must point at the article's history page`);
}

// Rows must be ordered newest-first.
for (let i = 1; i < rows.length; i++) {
  assert.ok(
    rows[i - 1].datetime >= rows[i].datetime,
    `rows must be sorted newest-first (row ${i - 1} ${rows[i - 1].datetime} < row ${i} ${rows[i].datetime})`,
  );
}

// Within a same-timestamp group, rows must be ordered by slug with numeric
// collation (compareTitles) so subnet_9 precedes subnet_10 — the same contract
// enforced elsewhere for article lists and backlinks.
for (let i = 1; i < rows.length; i++) {
  if (rows[i - 1].datetime !== rows[i].datetime) continue;
  const prevSlug = slugFromWikiHref(rows[i - 1].titleHref || '');
  const curSlug = slugFromWikiHref(rows[i].titleHref || '');
  assert.ok(
    compareTitles(prevSlug, curSlug) <= 0,
    `rows with the same timestamp must be ordered by slug with compareTitles (${prevSlug} > ${curSlug} at rows ${i - 1}–${i}, date ${rows[i].datetime})`,
  );
}

// Cross-check against the real history data: gather every dated commit whose
// slug has a built article page (the same set the page joins against), and pin
// the page's row count and newest date to that ground truth.
const dated = [];
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const slug = file.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(wikiDir, slug, 'index.html'))) continue; // unpublished/orphaned
  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history || [];
  for (const entry of history) {
    if (typeof entry.date === 'string' && entry.date) dated.push(entry.date);
  }
}
dated.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

const expectedCount = Math.min(dated.length, RECENT_LIMIT);
assert.equal(rows.length, expectedCount, `recent changes must show ${expectedCount} rows (min of ${dated.length} dated commits and ${RECENT_LIMIT})`);
assert.equal(rows[0].datetime, dated[0], `newest row (${rows[0].datetime}) must equal the newest commit across published articles (${dated[0]})`);

// On-site discovery must be coherent across the primary navigation surfaces, so
// the page is reachable without inspecting the sitemap: the shared footer
// (rendered on every WikiLayout page, e.g. articles) and the homepage's own
// primary nav — both of which already link the other special pages.
const sampleArticle = path.join(wikiDir, slugFromWikiHref(rows[0].titleHref), 'index.html');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/recentchanges"'),
  'the shared page footer must link to /wiki/special/recentchanges (article-page discovery path)',
);
const homeHtml = fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8');
assert.ok(
  homeHtml.includes('href="/wiki/special/recentchanges"'),
  'the homepage primary nav must link to /wiki/special/recentchanges (homepage discovery path)',
);

console.log(`Recent changes check passed (${rows.length} rows, newest ${rows[0].datetime}, footer + homepage discovery links present)`);
