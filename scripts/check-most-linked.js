import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedPages } from './most-linked.js';

// Load-bearing regression check for Special:MostLinkedPages. It pins the rendered
// ranking to the build-time link graph: the page must list exactly the published
// articles that have inbound links from other published articles, ranked by that
// count (desc, then title, then slug), with the count linking to each article's
// "What links here" page — and it must be reachable from the footer and homepage
// nav. It fails if the ranking, counts, order, links, or discovery regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const mlFile = path.join(wikiDir, 'special', 'mostlinkedpages', 'index.html');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(mlFile), 'dist/wiki/special/mostlinkedpages/index.html not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(mlFile, 'utf8');
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Parse the rendered ranking rows.
const rows = [...html.matchAll(/<li[^>]*class="mw-ml-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  titleHref: (block.match(/mw-ml-title[^>]*href="([^"]+)"/) || [])[1],
  titleText: decode((block.match(/mw-ml-title[^>]*>([^<]*)<\/a>/) || [])[1] || ''),
  countHref: (block.match(/mw-ml-count[^>]*href="([^"]+)"/) || [])[1],
  count: Number((block.match(/mw-ml-count[^>]*>(\d+)/) || [])[1]),
}));
assert.ok(rows.length > 0, 'most linked pages must render at least one ranked row');

// Each row: a built article link, a count link to that article's (built) backlinks
// page, a positive count, and a title that matches the slug map. Verifying the
// rendered title equals slugmap[slug].title proves the page and the slug map agree
// on titles, so the slug-map title used in the expected tiebreak below is the same
// title the page sorted on.
const renderedSlugs = rows.map((row, i) => {
  const m = (row.titleHref || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(m, `row ${i} has a malformed article link: ${row.titleHref}`);
  const slug = m[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.equal(row.countHref, `/wiki/${slug}/backlinks/`, `row ${i} count must link to /wiki/${slug}/backlinks/`);
  assert.ok(
    fs.existsSync(path.join(wikiDir, slug, 'backlinks', 'index.html')),
    `row ${i} count links to /wiki/${slug}/backlinks/ but that page was not built`,
  );
  assert.ok(Number.isInteger(row.count) && row.count > 0, `row ${i} must show a positive link count, got ${row.count}`);
  assert.ok(slugmap[slug], `row ${i} links to /wiki/${slug}/ which is not a known article`);
  assert.equal(row.titleText, slugmap[slug].title, `row ${i} title must match the article title for ${slug}`);
  return slug;
});

// Rows must be ordered by count, descending.
for (let i = 1; i < rows.length; i++) {
  assert.ok(
    rows[i - 1].count >= rows[i].count,
    `rows must be sorted by count desc (row ${i - 1}=${rows[i - 1].count} < row ${i}=${rows[i].count})`,
  );
}

// Re-derive the expected ranking from the link graph via the SAME shared builder
// the page and mostlinkedpages.json use, so the check pins the exact rule the
// surfaces produce: published-only inbound count, self-links excluded
// (`from !== slug`), count-desc then compareTitles(title) then raw slug order when titles tie.
const titleBySlug = Object.fromEntries(
  Object.entries(slugmap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
);
const expected = buildMostLinkedPages({ backlinks, titleBySlug });

assert.deepEqual(
  renderedSlugs,
  expected.map((e) => e.slug),
  'rendered ranking (order + membership) must match the link graph exactly',
);
assert.deepEqual(
  rows.map((r) => r.count),
  expected.map((e) => e.count),
  'rendered counts must match the per-article inbound-link counts from the link graph',
);

// On-site discovery: the shared footer (every article page) and the homepage nav
// must link to the page, so it is reachable without the sitemap.
const sampleArticle = path.join(wikiDir, renderedSlugs[0], 'index.html');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/mostlinkedpages"'),
  'the shared page footer must link to /wiki/special/mostlinkedpages (article-page discovery path)',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/mostlinkedpages"'),
  'the homepage primary nav must link to /wiki/special/mostlinkedpages (homepage discovery path)',
);

console.log(`Most linked pages check passed (${rows.length} ranked articles, top=${renderedSlugs[0]} with ${rows[0].count} links, footer + homepage discovery present)`);
