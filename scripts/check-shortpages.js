import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing regression check for Special:ShortPages. It pins the rendered
// ranking to the content collection: the page must list every published article
// exactly once, ranked by word count (asc, then title, then slug), with the
// count re-derived independently from each article's source — and it must be
// reachable from the footer and homepage nav. It fails if the ranking, counts,
// order, membership, links, or discovery regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const spFile = path.join(wikiDir, 'special', 'shortpages', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const contentRoot = path.join(projectRoot, 'src', 'content', 'pages');

assert.ok(fs.existsSync(spFile), 'dist/wiki/special/shortpages/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(contentRoot), 'src/content/pages not found; run the build first (it syncs articles)');

const html = fs.readFileSync(spFile, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Map every content-collection source file to its route slug, using the same
// id-to-slug derivation getPageSlug applies, so the recomputed word count is
// keyed exactly as the page keys it.
const slugToSource = new Map();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(md|mdx)$/.test(entry.name)) {
      const id = path.relative(contentRoot, full).split(path.sep).join('/');
      const slug = id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');
      slugToSource.set(slug, full);
    }
  }
};
walk(contentRoot);

// The article body is the file content after the YAML frontmatter block — the
// same string Astro exposes as page.body. Word count splits on whitespace, the
// exact metric Special:Statistics uses, so it is robust to newline/whitespace
// differences between the parsed body and the raw file.
const wordCountForSlug = (slug) => {
  const file = slugToSource.get(slug);
  assert.ok(file, `no content source found for rendered slug "${slug}"`);
  const raw = fs.readFileSync(file, 'utf8');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');
  return body.trim().split(/\s+/).filter(Boolean).length;
};

// Parse the rendered ranking rows.
const rows = [...html.matchAll(/<li[^>]*class="mw-sp-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  titleHref: (block.match(/mw-sp-title[^>]*href="([^"]+)"/) || [])[1],
  titleText: decode((block.match(/mw-sp-title[^>]*>([^<]*)<\/a>/) || [])[1] || ''),
  words: Number((block.match(/mw-sp-count[^>]*>(\d+)/) || [])[1]),
}));
assert.ok(rows.length > 0, 'short pages must render at least one row');

// Each row links to a built article, its title matches the slug map, and the
// rendered word count matches the count re-derived from that article's source.
const renderedSlugs = rows.map((row, i) => {
  const m = (row.titleHref || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(m, `row ${i} has a malformed article link: ${row.titleHref}`);
  const slug = m[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.ok(slugmap[slug], `row ${i} links to /wiki/${slug}/ which is not a known article`);
  assert.equal(row.titleText, slugmap[slug].title, `row ${i} title must match the article title for ${slug}`);
  assert.ok(Number.isInteger(row.words) && row.words >= 0, `row ${i} must show a word count, got ${row.words}`);
  assert.equal(row.words, wordCountForSlug(slug), `row ${i} word count for ${slug} must match the article source`);
  return slug;
});

// Completeness: every published article appears exactly once.
const slugmapSlugs = Object.keys(slugmap).sort();
assert.deepEqual([...renderedSlugs].sort(), slugmapSlugs, 'short pages must list every published article exactly once');

// Rows must be ordered by word count ascending (shortest first), then title,
// then slug — the same deterministic order the page sorts on.
for (let i = 1; i < rows.length; i++) {
  const prev = rows[i - 1];
  const cur = rows[i];
  const ordered =
    prev.words < cur.words ||
    (prev.words === cur.words &&
      (prev.titleText.localeCompare(cur.titleText) < 0 ||
        (prev.titleText === cur.titleText && renderedSlugs[i - 1].localeCompare(renderedSlugs[i]) <= 0)));
  assert.ok(ordered, `rows must be sorted shortest-first (row ${i - 1}="${prev.titleText}"=${prev.words} vs row ${i}="${cur.titleText}"=${cur.words})`);
}

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

console.log(`Short pages check passed (${rows.length} articles ranked shortest-first, shortest="${renderedSlugs[0]}" with ${rows[0].words} words, footer + homepage discovery present)`);
