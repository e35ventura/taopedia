import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');
const statsFile = path.join(wikiDir, 'special', 'statistics', 'index.html');

assert.ok(fs.existsSync(statsFile), 'dist/wiki/special/statistics/index.html not found; run the build first');
const html = fs.readFileSync(statsFile, 'utf8');

// Count the actual built article pages (catch-all route; exclude the
// category/special hubs and each article's /history/, /backlinks/, and /cite/
// subpages) so the page's "Articles" figure can be pinned to reality, not just
// asserted to be a number.
const countArticles = (dir) => {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countArticles(full);
    else if (entry.name === 'index.html') {
      const segs = path.relative(wikiDir, full).split(path.sep);
      if (segs.length < 2) continue;
      if (segs[0] === 'category' || segs[0] === 'special') continue;
      const parent = segs[segs.length - 2];
      if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
      n += 1;
    }
  }
  return n;
};
const actualArticles = countArticles(wikiDir);
assert.ok(actualArticles > 0, 'no built article pages found to count');

// Each stat row renders as <dt>Label</dt><dd>value</dd>; pull the value by
// label. dt/dd carry Astro's scoped-style data-astro-cid attribute, so allow
// attributes on the tags.
const statValue = (label) => {
  const m = html.match(new RegExp(`<dt[^>]*>${label}</dt>\\s*<dd[^>]*>([^<]+)`));
  return m ? m[1].trim() : null;
};

for (const label of ['Articles', 'Topics', 'Total revisions', 'Total words', 'Average words per article', 'Largest topic']) {
  assert.ok(statValue(label) !== null, `statistics page must show a "${label}" stat`);
}

// The Articles figure must equal the real built-article count (comma-formatted).
const reportedArticles = Number(statValue('Articles').replace(/,/g, ''));
assert.equal(
  reportedArticles,
  actualArticles,
  `statistics "Articles" (${reportedArticles}) must equal the built article count (${actualArticles})`,
);

// Aggregates must be positive, and "Most recently updated" must be a valid date.
for (const label of ['Topics', 'Total revisions', 'Total words']) {
  assert.ok(Number(statValue(label).replace(/,/g, '')) > 0, `"${label}" must be a positive number`);
}
const time = html.match(/Most recently updated<\/dt>\s*<dd[^>]*><time datetime="([^"]+)"/);
assert.ok(time && !Number.isNaN(Date.parse(time[1])), 'statistics page must show a valid "Most recently updated" date');

console.log(`Statistics check passed (Articles=${reportedArticles} matches ${actualArticles} built pages)`);
