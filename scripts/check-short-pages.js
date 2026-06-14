import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing regression check for Special:ShortPages. It pins the rendered list
// to ground truth taken from the articles themselves: every built article page
// already embeds its word count as data-word-count in the mw-article-meta footer
// (the same body-token count the page uses), so the check reads those counts,
// derives the shortest SHORT_LIMIT articles independently, and asserts the page
// renders exactly that set — same order, same counts — with each row's count
// matching the article footer and the footer + homepage discovery links present.

// Must match SHORT_LIMIT in src/pages/wiki/special/shortpages.astro.
const SHORT_LIMIT = 50;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const spFile = path.join(wikiDir, 'special', 'shortpages', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(spFile), 'dist/wiki/special/shortpages/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Ground truth: walk every built article page (catch-all route; exclude the
// special/category hubs and the per-article history/backlinks/cite sub-pages) and
// read its embedded word count from the mw-article-meta footer.
const wordsBySlug = {};
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
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite') continue;
    const slug = segs.slice(0, -1).join('/');
    const m = fs.readFileSync(full, 'utf8').match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"/);
    assert.ok(m, `article /wiki/${slug}/ is missing a data-word-count footer`);
    wordsBySlug[slug] = Number(m[1]);
  }
};
walk(wikiDir);
const totalArticles = Object.keys(wordsBySlug).length;
assert.ok(totalArticles > 0, 'no built article pages found');

// The shortest SHORT_LIMIT articles, by the same sort the page uses.
const expected = Object.entries(wordsBySlug)
  .map(([slug, words]) => {
    assert.ok(slugmap[slug], `built article /wiki/${slug}/ is missing from the slug map`);
    return { slug, title: slugmap[slug].title, words };
  })
  .sort((a, b) => a.words - b.words || a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
  .slice(0, SHORT_LIMIT);

// Parse the rendered rows.
const html = fs.readFileSync(spFile, 'utf8');
const rows = [...html.matchAll(/<li[^>]*class="mw-sp-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  titleHref: (block.match(/mw-sp-title[^>]*href="([^"]+)"/) || [])[1],
  titleText: decode((block.match(/mw-sp-title[^>]*>([^<]*)<\/a>/) || [])[1] || ''),
  words: Number((block.match(/mw-sp-words[^>]*>(\d+)/) || [])[1]),
}));

assert.equal(
  rows.length,
  Math.min(totalArticles, SHORT_LIMIT),
  `short pages must show min(${totalArticles} articles, ${SHORT_LIMIT}) rows, got ${rows.length}`,
);

// Each row: a built article link, a count matching the article footer, and a
// title matching the slug map (so the tiebreak basis is the same title the page
// sorted on).
const renderedSlugs = rows.map((row, i) => {
  const mm = (row.titleHref || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(mm, `row ${i} has a malformed article link: ${row.titleHref}`);
  const slug = mm[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.equal(row.words, wordsBySlug[slug], `row ${i} word count must match the article footer for ${slug}`);
  assert.equal(row.titleText, slugmap[slug].title, `row ${i} title must match the article title for ${slug}`);
  return slug;
});

// Rows must be ordered shortest-first, and be exactly the expected set in order.
for (let i = 1; i < rows.length; i++) {
  assert.ok(rows[i - 1].words <= rows[i].words, `rows must be sorted by word count asc (row ${i - 1}=${rows[i - 1].words} > row ${i}=${rows[i].words})`);
}
assert.deepEqual(renderedSlugs, expected.map((e) => e.slug), 'rendered list (order + membership) must be the shortest articles');
assert.deepEqual(rows.map((r) => r.words), expected.map((e) => e.words), 'rendered word counts must match the shortest articles');

// On-site discovery: the shared footer (every article page) and the homepage nav.
assert.ok(
  fs.readFileSync(path.join(wikiDir, renderedSlugs[0], 'index.html'), 'utf8').includes('href="/wiki/special/shortpages"'),
  'the shared page footer must link to /wiki/special/shortpages (article-page discovery path)',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/shortpages"'),
  'the homepage primary nav must link to /wiki/special/shortpages (homepage discovery path)',
);

console.log(`Short pages check passed (${rows.length} of ${totalArticles} articles, shortest=${renderedSlugs[0]} at ${rows[0].words} words, footer + homepage discovery present)`);
