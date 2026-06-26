import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compareTitles, sortPagesByTitle } from '../src/lib/title-sort.js';

// Numbered titles must order numerically, not lexicographically.
const titles = [
  'Subnet 100: Platform',
  'Subnet 11: TrajectoryRL',
  'Subnet 9: iota',
  'Subnet 2: DSperse',
  'Subnet 10: Swap',
  'Subnet 1: Apex',
];
assert.deepEqual(
  [...titles].sort(compareTitles),
  [
    'Subnet 1: Apex',
    'Subnet 2: DSperse',
    'Subnet 9: iota',
    'Subnet 10: Swap',
    'Subnet 11: TrajectoryRL',
    'Subnet 100: Platform',
  ],
  'numbered titles must sort in numeric order',
);

// Plain alphabetical titles keep their ordinary order.
assert.deepEqual(
  ['Yuma Consensus', 'Axon', 'Dynamic TAO', 'Bittensor'].sort(compareTitles),
  ['Axon', 'Bittensor', 'Dynamic TAO', 'Yuma Consensus'],
  'alphabetical titles must keep lexicographic order',
);

// Numbers embedded mid-title must also compare numerically.
assert.ok(
  compareTitles('Chapter 2 of 10', 'Chapter 10 of 10') < 0,
  'embedded numbers must compare numerically',
);

const pages = [
  { data: { title: 'Subnet 10: Swap' } },
  { data: { title: 'Subnet 2: DSperse' } },
];
const sorted = sortPagesByTitle(pages);
assert.deepEqual(
  sorted.map((page) => page.data.title),
  ['Subnet 2: DSperse', 'Subnet 10: Swap'],
  'sortPagesByTitle must order pages by numeric title order',
);
assert.equal(
  pages[0].data.title,
  'Subnet 10: Swap',
  'sortPagesByTitle must not mutate its input',
);

// Nothing enforces unique titles across the collection, so same-title pages must
// break ties on the stable entry id rather than the import.meta.glob traversal
// order. The result must be identical no matter what order the pages arrive in.
const sameTitle = [
  { id: 'staking_b/index.mdx', data: { title: 'Staking' } },
  { id: 'staking_a/index.mdx', data: { title: 'Staking' } },
];
assert.deepEqual(
  sortPagesByTitle(sameTitle).map((page) => page.id),
  ['staking_a/index.mdx', 'staking_b/index.mdx'],
  'same-title pages must break ties on the stable entry id',
);
assert.deepEqual(
  sortPagesByTitle([...sameTitle].reverse()).map((page) => page.id),
  sortPagesByTitle(sameTitle).map((page) => page.id),
  'same-title ordering must not depend on the input (traversal) order',
);

// Every article list page must order titles through the shared helper so the
// directory, topic groups, and category routes cannot drift back to
// lexicographic ordering.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const listPages = [
  ['src/pages/index.astro', 'sortPagesByTitle('],
  ['src/pages/wiki/special/allpages.astro', 'sortPagesByTitle('],
];
for (const [listPage, marker] of listPages) {
  const source = fs.readFileSync(path.join(projectRoot, listPage), 'utf8');
  assert.ok(
    source.includes(marker),
    `${listPage} must sort article lists with sortPagesByTitle`,
  );
  assert.ok(
    !source.includes('.sort((a, b) => a.data.title.localeCompare(b.data.title))'),
    `${listPage} must not fall back to lexicographic title sorting`,
  );
}

const categoryHubSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/wiki/category/[category].astro'),
  'utf8',
);
assert.ok(
  categoryHubSource.includes('getCategoryArticles('),
  'category hub must sort members through getCategoryArticles',
);
assert.ok(
  categoryHubSource.includes('.sort(compareTitles)'),
  'category hub getStaticPaths must sort topic names with compareTitles, not plain sort()',
);

assert.deepEqual(
  ['Subnet 10', 'Subnet 9', 'Consensus'].sort(compareTitles),
  ['Consensus', 'Subnet 9', 'Subnet 10'],
  'category topic names must sort with numeric collation',
);

// The metadata search fallback renders results in search-data order, so the
// endpoint must order entries through sortSearchEntries in search-data.js.
const searchDataLib = fs.readFileSync(
  path.join(projectRoot, 'src/lib/search-data.js'),
  'utf8',
);
assert.ok(
  searchDataLib.includes('sortSearchEntries'),
  'search-data.js must export sortSearchEntries for search-data.json.ts',
);
assert.ok(
  searchDataLib.includes('compareTitles('),
  'search-data.js must order search entries with compareTitles',
);

// Special:MostLinkedPages sorts by count then by title tiebreak. The title
// tiebreak must use compareTitles (numeric collation) so same-count articles
// like "Subnet 2" and "Subnet 10" appear in numeric rather than lexicographic
// order — the same contract that the article list pages enforce via
// sortPagesByTitle (which wraps compareTitles internally). The HTML page and its
// JSON sibling now both rank through buildMostLinkedPages (scripts/most-linked.js),
// so validate the shared builder that owns the sort rather than the page source.
const mlSource = fs.readFileSync(
  path.join(projectRoot, 'scripts/most-linked.js'),
  'utf8',
);
assert.ok(
  mlSource.includes('compareTitles('),
  'most-linked.js must sort same-count title ties with compareTitles, not localeCompare',
);
assert.ok(
  !mlSource.includes('title.localeCompare('),
  'most-linked.js must not use localeCompare for the title tiebreak',
);
assert.ok(
  mlSource.includes('a.slug < b.slug'),
  'most-linked.js must tiebreak same-title slug ties on raw slug order, not compareTitles numeric slug collation',
);
assert.ok(
  !mlSource.includes('compareTitles(a.slug, b.slug)'),
  'most-linked.js must not use compareTitles for slug tiebreak',
);

// Special:Categories lists all topics in alphabetical order. Category names
// can be numeric-prefixed (e.g. "Subnet 9" vs "Subnet 10"), so the sort must
// use compareTitles (numeric collation) rather than localeCompare, which would
// sort "Subnet 10" before "Subnet 9" lexicographically.
const catPageSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/wiki/special/categories.astro'),
  'utf8',
);
const categoriesJsSource = fs.readFileSync(
  path.join(projectRoot, 'scripts/categories.js'),
  'utf8',
);
assert.ok(
  catPageSource.includes('buildCategories('),
  'categories.astro must list topics through buildCategories',
);
assert.ok(
  categoriesJsSource.includes('compareTitles(a.name, b.name)'),
  'categories.js must sort topic names with compareTitles, not localeCompare',
);

// Special:Statistics sorts topics by article count, then uses a topic-name
// tiebreak to pick the "Largest topic". The tiebreak must use compareTitles
// (numeric collation) so numeric-prefixed topics like "Subnet 9" and
// "Subnet 10" are ordered correctly when they have the same article count.
const statsSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/wiki/special/statistics.astro'),
  'utf8',
);
assert.ok(
  statsSource.includes('compareTitles('),
  'statistics.astro must sort the largest-topic tiebreak with compareTitles, not localeCompare',
);
assert.ok(
  !statsSource.includes('.localeCompare('),
  'statistics.astro must not use localeCompare for the topic tiebreak',
);
assert.ok(
  statsSource.includes('new Set(page.data.categories'),
  'statistics.astro must dedupe a page\'s own categories so a repeated frontmatter topic counts once',
);

// Search topic facets sort by result count, then by topic name. Topic names can
// be numeric-prefixed (e.g. "Subnet 9" vs "Subnet 10"), so the name tiebreak must
// use numeric collation rather than plain localeCompare.
const searchPage = fs.readFileSync(
  path.join(projectRoot, 'src/pages/search.astro'),
  'utf8',
);
assert.ok(
  searchPage.includes("localeCompare(b, 'en', { numeric: true })"),
  'search.astro must sort topic facets with numeric collation',
);
assert.ok(
  !searchPage.includes('.sort((a, b) => topicCounts[b] - topicCounts[a] || a.localeCompare(b))'),
  'search.astro must not use plain localeCompare for topic facet sort',
);

const backlinksSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/wiki/[...slug]/backlinks.astro'),
  'utf8',
);
const backlinksJsonSource = fs.readFileSync(
  path.join(projectRoot, 'src/pages/wiki/[...slug]/backlinks.json.ts'),
  'utf8',
);
const backlinksBuilderSource = fs.readFileSync(
  path.join(projectRoot, 'scripts/article-backlinks.js'),
  'utf8',
);
assert.ok(
  backlinksBuilderSource.includes('sortInboundBacklinkEntries'),
  'article-backlinks.js must own the shared inbound-backlink sort',
);
assert.ok(
  backlinksSource.includes('sortInboundBacklinkEntries'),
  'backlinks.astro must sort through the shared inbound-backlink sorter',
);
assert.ok(
  backlinksJsonSource.includes('sortInboundBacklinkEntries'),
  'backlinks.json.ts must sort through the shared inbound-backlink sorter',
);
assert.ok(
  !backlinksSource.includes('compareTitles(a.slug, b.slug)'),
  'backlinks.astro must not use compareTitles for slug tiebreak',
);
assert.ok(
  !backlinksJsonSource.includes('compareTitles(a.slug, b.slug)'),
  'backlinks.json.ts must not use compareTitles for slug tiebreak',
);

const relatedPagesSource = fs.readFileSync(path.join(projectRoot, 'src/lib/related-pages.ts'), 'utf8');
assert.ok(
  relatedPagesSource.includes('compareTitles(a.title, b.title)'),
  'related-pages.ts must sort title ties with compareTitles',
);
assert.ok(
  relatedPagesSource.includes('a.slug < b.slug'),
  'related-pages.ts must tiebreak same-title slug ties on raw slug order, not compareTitles numeric slug collation',
);
assert.ok(
  !relatedPagesSource.includes('compareTitles(a.slug, b.slug)'),
  'related-pages.ts must not use compareTitles for slug tiebreak',
);

// The homepage A–Z index groups sort letter keys with compareTitles so numeric
// collation stays consistent with the rest of the title-sort contract.
const indexSource = fs.readFileSync(path.join(projectRoot, 'src/pages/index.astro'), 'utf8');
assert.ok(
  indexSource.includes('compareTitles(a, b)'),
  'index.astro must sort A–Z group keys with compareTitles, not localeCompare',
);
assert.ok(
  !indexSource.includes('return a.localeCompare(b)'),
  'index.astro must not use localeCompare for A–Z group key sorting',
);

// Sitemap article and category paths can include numeric slugs (e.g. subnet_9
// vs subnet_10), so path ordering must use compareTitles rather than localeCompare.
const sitemapSource = fs.readFileSync(path.join(projectRoot, 'src/pages/sitemap.xml.ts'), 'utf8');
assert.ok(
  sitemapSource.includes('compareTitles(a.path, b.path)'),
  'sitemap.xml.ts must sort paths with compareTitles, not localeCompare',
);
assert.ok(
  !sitemapSource.includes('a.path.localeCompare(b.path)'),
  'sitemap.xml.ts must not use localeCompare for path sorting',
);

// Recent changes uses the same numeric slug tiebreak as backlinks and most-linked.
const historySource = fs.readFileSync(
  path.join(projectRoot, 'src/lib/article-history.ts'),
  'utf8',
);
assert.ok(
  historySource.includes('compareTitles(a.slug, b.slug)'),
  'article-history.ts must sort same-date slug ties with compareTitles, not raw string order',
);
assert.ok(
  !historySource.includes('return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0'),
  'article-history.ts must not use raw string comparison for slug tiebreak',
);

console.log('title sort check passed');
