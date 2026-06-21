import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const longPagesFile = path.join(wikiDir, 'special', 'longpages', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(longPagesFile), 'dist/wiki/special/longpages/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(longPagesFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const rows = [...html.matchAll(/<li[^>]*class="mw-lp-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  titleHref: (block.match(/mw-lp-title[^>]*href="([^"]+)"/) || [])[1],
  titleText: decode((block.match(/mw-lp-title[^>]*>([^<]*)<\/a>/) || [])[1] || ''),
  wordCount: Number((block.match(/mw-lp-count[^>]*>(\d+)/) || [])[1]),
}));
assert.ok(rows.length > 0, 'long pages must render at least one ranked row');

const renderedSlugs = rows.map((row, i) => {
  const match = (row.titleHref || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(match, `row ${i} has a malformed article link: ${row.titleHref}`);
  const slug = match[1];
  const articleFile = path.join(wikiDir, slug, 'index.html');
  assert.ok(fs.existsSync(articleFile), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.ok(Number.isInteger(row.wordCount) && row.wordCount > 0, `row ${i} must show a positive word count`);
  assert.ok(slugmap[slug], `row ${i} links to unknown article slug ${slug}`);
  assert.equal(row.titleText, slugmap[slug].title, `row ${i} title must match the article title for ${slug}`);

  const articleHtml = fs.readFileSync(articleFile, 'utf8');
  const meta = articleHtml.match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"[^>]*>/);
  assert.ok(meta, `row ${i} article ${slug} must expose a data-word-count attribute`);
  assert.equal(row.wordCount, Number(meta[1]), `row ${i} word count must match /wiki/${slug}/`);

  return slug;
});

for (let i = 1; i < rows.length; i++) {
  assert.ok(
    rows[i - 1].wordCount >= rows[i].wordCount,
    `rows must be sorted by word count desc (row ${i - 1}=${rows[i - 1].wordCount} < row ${i}=${rows[i].wordCount})`,
  );
}

const expected = Object.entries(slugmap)
  .map(([slug, entry]) => {
    const articleFile = path.join(wikiDir, slug, 'index.html');
    if (!fs.existsSync(articleFile)) return null;
    const articleHtml = fs.readFileSync(articleFile, 'utf8');
    const meta = articleHtml.match(/<div class="mw-article-meta"[^>]*data-word-count="(\d+)"[^>]*>/);
    if (!meta) return null;
    return {
      slug,
      title: entry.title,
      wordCount: Number(meta[1]),
    };
  })
  .filter(Boolean)
  .filter((entry) => entry.wordCount > 0)
  .sort((a, b) => b.wordCount - a.wordCount || compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

assert.deepEqual(
  renderedSlugs,
  expected.map((entry) => entry.slug),
  'rendered long-pages ranking (order + membership) must match built article word counts exactly',
);
assert.deepEqual(
  rows.map((row) => row.wordCount),
  expected.map((entry) => entry.wordCount),
  'rendered long-pages counts must match built article data-word-count values',
);

const sampleArticle = path.join(wikiDir, renderedSlugs[0], 'index.html');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/longpages"'),
  'the shared page footer must link to /wiki/special/longpages (article-page discovery path)',
);

console.log(
  `Long pages check passed (${rows.length} ranked articles, longest=${renderedSlugs[0]} with ${rows[0].wordCount} words, footer discovery present)`,
);
