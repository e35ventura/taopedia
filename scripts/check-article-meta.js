import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

// The article route is a catch-all ([...slug]); walk recursively so nested
// slugs are covered. Article pages are <slug>/index.html — exclude the
// category/special hubs and each article's own /history/, /backlinks/, and
// /cite/ subpages, none of which carries (or needs) the metadata footer.
const articlePages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') {
      const segs = path.relative(wikiDir, full).split(path.sep);
      if (segs.length < 2) continue;
      if (segs[0] === 'category' || segs[0] === 'special') continue;
      const parent = segs[segs.length - 2];
      if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
      articlePages.push(full);
    }
  }
};
walk(wikiDir);
assert.ok(articlePages.length > 0, 'no built article pages found');

let withDate = 0;
for (const file of articlePages) {
  const html = fs.readFileSync(file, 'utf8');
  const where = path.relative(wikiDir, file);

  const meta = html.match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(meta, `${where}: missing the mw-article-meta footer (with data-word-count)`);
  const wordCount = Number(meta[1]);
  const block = meta[2];

  // Reading time must be present AND exactly the rounded-up ~200 wpm estimate of
  // the embedded word count — this pins the formula so a round-vs-ceil rounding
  // regression (e.g. a 201-399 word article) fails the build.
  const reading = block.match(/(\d+) min read/);
  assert.ok(reading, `${where}: footer must show a reading time`);
  const expected = Math.max(1, Math.ceil(wordCount / 200));
  assert.equal(
    Number(reading[1]),
    expected,
    `${where}: reading time ${reading[1]} must equal ceil(${wordCount}/200)=${expected}`,
  );

  // When a last-updated date is shown it must be machine-readable and valid.
  if (block.includes('Last updated')) {
    const time = block.match(/<time datetime="([^"]+)">([^<]+)<\/time>/);
    assert.ok(time, `${where}: "Last updated" must wrap a <time datetime> element`);
    assert.ok(!Number.isNaN(Date.parse(time[1])), `${where}: <time datetime> must be a valid date (${time[1]})`);
    withDate += 1;
  }
}

// The history wiring must actually populate dates for real articles, not be uniformly absent.
assert.ok(withDate > 0, 'no article showed a last-updated date; history wiring is broken');

console.log(`Article-meta check passed (${articlePages.length} articles; ${withDate} with a last-updated date)`);
