import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

// The article route is a catch-all ([...slug]); walk recursively so nested
// slugs are covered. Article pages are <slug>/index.html — exclude the
// category/special hubs and each article's own /history/ subpage, neither of
// which carries (or needs) the metadata footer.
const articlePages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') {
      const segs = path.relative(wikiDir, full).split(path.sep);
      if (segs[0] === 'category' || segs[0] === 'special') continue;
      if (segs[segs.length - 2] === 'history') continue;
      articlePages.push(full);
    }
  }
};
walk(wikiDir);
assert.ok(articlePages.length > 0, 'no built article pages found');

const META_RE = /<div class="mw-article-meta"[^>]*>([\s\S]*?)<\/div>/;
let withDate = 0;
for (const file of articlePages) {
  const html = fs.readFileSync(file, 'utf8');
  const where = path.relative(wikiDir, file);

  const meta = html.match(META_RE);
  assert.ok(meta, `${where}: missing the mw-article-meta footer`);
  const block = meta[1];

  // Reading time is always present and must be a positive whole-minute estimate.
  const reading = block.match(/(\d+) min read/);
  assert.ok(reading && Number(reading[1]) >= 1, `${where}: footer must show a reading time of >= 1 min`);

  // When a last-updated date is shown it must be machine-readable and valid.
  const time = block.match(/<time datetime="([^"]+)">([^<]+)<\/time>/);
  if (block.includes('Last updated')) {
    assert.ok(time, `${where}: "Last updated" must wrap a <time datetime> element`);
    assert.ok(!Number.isNaN(Date.parse(time[1])), `${where}: <time datetime> must be a valid date (${time[1]})`);
    withDate += 1;
  }
}

// The history wiring must actually populate dates for real articles, not be uniformly absent.
assert.ok(withDate > 0, 'no article showed a last-updated date; history wiring is broken');

console.log(`Article-meta check passed (${articlePages.length} articles; ${withDate} with a last-updated date)`);
