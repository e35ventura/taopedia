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

// HTML figures must match the built statistics.json sibling — the same parity
// contract check-statistics-json.js enforces on the JSON endpoint.
const jsonFile = path.join(wikiDir, 'special', 'statistics.json');
assert.ok(fs.existsSync(jsonFile), 'dist/wiki/special/statistics.json not found; run the build first');
const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

const htmlNumber = (label) => Number((statValue(label) ?? '').replace(/,/g, ''));
assert.equal(htmlNumber('Articles'), json.totalArticles, 'HTML Articles must equal statistics.json totalArticles');
assert.equal(htmlNumber('Topics'), json.totalTopics, 'HTML Topics must equal statistics.json totalTopics');
assert.equal(htmlNumber('Total revisions'), json.totalRevisions, 'HTML Total revisions must equal statistics.json totalRevisions');
assert.equal(htmlNumber('Total words'), json.totalWords, 'HTML Total words must equal statistics.json totalWords');
assert.equal(
  htmlNumber('Average words per article'),
  json.averageWords,
  'HTML Average words per article must equal statistics.json averageWords',
);
if (json.largestTopic) {
  const largest = statValue('Largest topic');
  assert.ok(largest, 'HTML must show Largest topic when statistics.json has largestTopic');
  assert.ok(largest.startsWith(`${json.largestTopic.name} (`), 'HTML Largest topic must match statistics.json largestTopic.name');
  assert.ok(largest.includes(json.largestTopic.count.toLocaleString('en-US')), 'HTML Largest topic must match statistics.json largestTopic.count');
} else {
  assert.equal(statValue('Largest topic'), null, 'HTML must omit Largest topic when statistics.json has no largestTopic');
}
if (json.newestDate) {
  assert.equal(time[1], json.newestDate, 'HTML Most recently updated must equal statistics.json newestDate');
}

console.log(`Statistics check passed (Articles=${reportedArticles} matches ${actualArticles} built pages; HTML matches statistics.json)`);
