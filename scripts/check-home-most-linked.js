import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMostLinkedPages } from '../src/lib/most-linked.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const homeFile = path.join(projectRoot, 'dist', 'index.html');
const backlinksFile = path.join(projectRoot, 'public', 'data', 'backlinks.json');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(homeFile), 'dist/index.html not found; run the build first');
assert.ok(fs.existsSync(backlinksFile), 'public/data/backlinks.json not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');

const html = fs.readFileSync(homeFile, 'utf8');
const backlinks = JSON.parse(fs.readFileSync(backlinksFile, 'utf8'));
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const titleBySlug = {};
for (const [slug, entry] of Object.entries(slugmap)) titleBySlug[slug] = entry.title;
const expected = buildMostLinkedPages({ backlinks, titleBySlug }).slice(0, 6);
assert.ok(expected.length > 0, 'expected at least one most-linked article');

const mostLinkedSection = html.match(
  /<section class="home-section"[^>]*>[\s\S]*?<h2\b[^>]*>\s*Most Linked Concepts\s*<\/h2>([\s\S]*?)<\/section>/,
);
assert.ok(mostLinkedSection, 'home page must render a "Most Linked Concepts" section');
assert.match(
  mostLinkedSection[0],
  /href="\/wiki\/special\/mostlinkedpages"/,
  'Most Linked Concepts must link to /wiki/special/mostlinkedpages',
);

const renderedRows = [...mostLinkedSection[1].matchAll(/<a\b[^>]*class="article-card"[^>]*href="\/wiki\/([^"/]+)\/"[^>]*>([\s\S]*?)<\/a>/g)].map(
  ([, slug, block]) => ({
    slug,
    title: (block.match(/<strong\b[^>]*>([^<]+)<\/strong>/) || [])[1] || '',
    count: Number((block.match(/<span\b[^>]*class="article-meta"[^>]*>(\d+) linking article/) || [])[1]),
  }),
);

assert.equal(
  renderedRows.length,
  expected.length,
  `Most Linked Concepts must render the top ${expected.length} ranked articles`,
);

renderedRows.forEach((row, i) => {
  assert.equal(row.slug, expected[i].slug, `row ${i} slug must match the shared most-linked ranking`);
  assert.equal(row.title, expected[i].title, `row ${i} title must match the article title for ${expected[i].slug}`);
  assert.equal(row.count, expected[i].count, `row ${i} count must match the inbound-link ranking for ${expected[i].slug}`);
});

const recentSection = html.match(
  /<section class="home-section"[^>]*>[\s\S]*?<h2\b[^>]*>\s*Recently Updated\s*<\/h2>([\s\S]*?)<\/section>/,
);
assert.ok(recentSection, 'home page must render a Recently Updated section');
const recentSlugs = [...recentSection[1].matchAll(/href="\/wiki\/([^"/]+)\/"/g)].map(([, slug]) => slug);
assert.deepEqual(
  recentSlugs.filter((slug) => expected.some((entry) => entry.slug === slug)),
  [],
  'Recently Updated must not repeat articles already surfaced in Most Linked Concepts',
);

const suggestionBlock = html.match(/<div class="search-suggestions"[\s\S]*?<\/div>/);
assert.ok(suggestionBlock, 'home page must render the search suggestion row');
for (const query of ['wallets', 'staking', 'yuma consensus', 'dynamic tao']) {
  assert.ok(
    suggestionBlock[0].includes(`/search/?q=${encodeURIComponent(query)}`),
    `search suggestions must link to /search/?q=${encodeURIComponent(query)}`,
  );
}

console.log(
  `Home most-linked check passed (${renderedRows.length} ranked cards; top=${renderedRows[0].slug} with ${renderedRows[0].count} links; recent section deduped)`,
);
