import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTitles } from '../src/lib/title-sort.js';

// Load-bearing regression check for Special:DeadEndPages. It pins the rendered
// list to the build-time outbound link graph: the page must list exactly the
// published articles that link to no OTHER published article (self-links and
// links to unpublished targets don't count), ordered by the site's numeric
// title collation, every row resolving to a built article — and it must be
// reachable from the footer and homepage nav. It fails if the membership,
// order, links, or discovery regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const deFile = path.join(wikiDir, 'special', 'deadendpages', 'index.html');
const linkgraphFile = path.join(projectRoot, 'public', 'data', 'linkgraph.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(deFile), 'dist/wiki/special/deadendpages/index.html not found; run the build first');
assert.ok(fs.existsSync(linkgraphFile), 'public/data/linkgraph.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(deFile, 'utf8');
const linkgraph = JSON.parse(fs.readFileSync(linkgraphFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Parse the rendered rows.
const rows = [...html.matchAll(/<li[^>]*class="mw-de-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, block]) => ({
  href: (block.match(/href="([^"]+)"/) || [])[1],
  title: decode((block.match(/>([^<]*)<\/a>/) || [])[1] || ''),
}));
assert.ok(rows.length > 0, 'dead-end pages must render at least one article');

// Each row links to a built article whose rendered title matches the slug map.
const renderedSlugs = rows.map((row, i) => {
  const m = (row.href || '').match(/^\/wiki\/(.+)\/$/);
  assert.ok(m, `row ${i} has a malformed article link: ${row.href}`);
  const slug = m[1];
  assert.ok(fs.existsSync(path.join(wikiDir, slug, 'index.html')), `row ${i} links to unbuilt /wiki/${slug}/`);
  assert.ok(slugmap[slug], `row ${i} links to /wiki/${slug}/ which is not a known article`);
  assert.equal(row.title, slugmap[slug].title, `row ${i} title must match the article title for ${slug}`);
  return slug;
});

// Re-derive the expected dead-end set independently from the outbound link
// graph, with the same published-only, non-self join and the same sort.
const expected = Object.keys(slugmap)
  .filter((slug) => {
    const links = linkgraph[slug] ?? [];
    return !links.some((link) => link.target && link.target !== slug && slugmap[link.target]);
  })
  .map((slug) => ({ slug, title: slugmap[slug].title }))
  .sort((a, b) => compareTitles(a.title, b.title) || a.slug.localeCompare(b.slug));

assert.deepEqual(
  renderedSlugs,
  expected.map((e) => e.slug),
  'rendered dead-end list (membership + order) must match the outbound link graph exactly',
);

// On-site discovery: the shared footer (every article page) and the homepage
// nav must link to the page, so it is reachable without the sitemap.
const sampleArticle = path.join(wikiDir, renderedSlugs[0], 'index.html');
assert.ok(
  fs.readFileSync(sampleArticle, 'utf8').includes('href="/wiki/special/deadendpages"'),
  'the shared page footer must link to /wiki/special/deadendpages (article-page discovery path)',
);
assert.ok(
  fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').includes('href="/wiki/special/deadendpages"'),
  'the homepage primary nav must link to /wiki/special/deadendpages (homepage discovery path)',
);

console.log(`Dead-end pages check passed (${rows.length} dead-end articles, matched the outbound link graph exactly; footer + homepage discovery present)`);
