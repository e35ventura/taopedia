import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { compareTitles } from '../src/lib/title-sort.js';

// Load-bearing regression check for Special:ShortPages. It pins the rendered list
// to the article sources: the page must list exactly the published articles,
// ranked by body word count ascending (then title, then slug), each linking to
// its built article -- and it must be reachable from the footer and homepage nav.
// It fails if the ranking, word counts, order, links, or discovery regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const spFile = path.join(wikiDir, 'special', 'shortpages', 'index.html');
const contentDir = path.join(projectRoot, 'src', 'content', 'pages');

assert.ok(fs.existsSync(spFile), 'dist/wiki/special/shortpages/index.html not found; run the build first');
assert.ok(fs.existsSync(contentDir), 'src/content/pages not found; run the article sync first');

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const html = fs.readFileSync(spFile, 'utf8');

// Parse the rendered rows.
const rows = [...html.matchAll(/<li[^>]*class="mw-sp-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  titleHref: (block.match(/mw-sp-title[^>]*href="([^"]+)"/) || [])[1],
  titleText: decode((block.match(/mw-sp-title[^>]*>([^<]*)<\/a>/) || [])[1] || ''),
  words: Number((block.match(/mw-sp-count[^>]*>(\d+)/) || [])[1]),
}));
assert.ok(rows.length > 0, 'short pages must render at least one article row');

// Each row links to a built article and shows a non-negative integer word count.
const renderedSlugs = rows.map((row, i) => {
  const m = (row.titleHref || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(m, `row ${i} has a malformed article link: ${row.titleHref}`);
  const slug = m[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.ok(Number.isInteger(row.words) && row.words >= 0, `row ${i} must show a word count, got ${row.words}`);
  return slug;
});

// Rows must be ordered by word count, ascending.
for (let i = 1; i < rows.length; i++) {
  assert.ok(
    rows[i - 1].words <= rows[i].words,
    `rows must be sorted by word count asc (row ${i - 1}=${rows[i - 1].words} > row ${i}=${rows[i].words})`,
  );
}

// Re-derive the expected list independently from the article sources, using the
// same body word count and the same deterministic sort as the page, and assert
// the rendered membership, order, counts, and titles match exactly.
const expected = [];
for (const dirent of fs.readdirSync(contentDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const slug = dirent.name;
  const source = ['index.mdx', 'index.md']
    .map((name) => path.join(contentDir, slug, name))
    .find((file) => fs.existsSync(file));
  if (!source) continue;
  const parsed = matter(fs.readFileSync(source, 'utf8'));
  if (!parsed.data || typeof parsed.data.title !== 'string') continue;
  if (parsed.data.draft === true) continue;
  const words = parsed.content.trim().split(/\s+/).filter(Boolean).length;
  expected.push({ slug, title: parsed.data.title, words });
}
expected.sort((a, b) => a.words - b.words || compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

assert.deepEqual(
  renderedSlugs,
  expected.map((e) => e.slug),
  'rendered list (order + membership) must match every published article, shortest first',
);
assert.deepEqual(
  rows.map((r) => r.words),
  expected.map((e) => e.words),
  'rendered word counts must match the article body word counts',
);
rows.forEach((row, i) => {
  assert.equal(row.titleText, expected[i].title, `row ${i} title must match the article title for ${expected[i].slug}`);
});

// On-site discovery: the shared footer (every article page) and the homepage nav
// must link to the page, so it is reachable without the sitemap.
const sampleArticle = path.join(wikiDir, renderedSlugs[0], 'index.html');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/shortpages"'),
  'the shared page footer must link to /wiki/special/shortpages (article-page discovery path)',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/shortpages"'),
  'the homepage primary nav must link to /wiki/special/shortpages (homepage discovery path)',
);

console.log(
  `Short pages check passed (${rows.length} articles, shortest=${renderedSlugs[0]} with ${rows[0].words} words, footer + homepage discovery present)`,
);
