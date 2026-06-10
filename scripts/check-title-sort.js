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

// Every article list page must order titles through the shared helper so the
// directory, topic groups, and category routes cannot drift back to
// lexicographic ordering.
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const listPages = [
  'src/pages/index.astro',
  'src/pages/wiki/special/allpages.astro',
  'src/pages/wiki/category/[category].astro',
];
for (const listPage of listPages) {
  const source = fs.readFileSync(path.join(projectRoot, listPage), 'utf8');
  assert.ok(
    source.includes('sortPagesByTitle('),
    `${listPage} must sort article lists with sortPagesByTitle`,
  );
  assert.ok(
    !source.includes('.sort((a, b) => a.data.title.localeCompare(b.data.title))'),
    `${listPage} must not fall back to lexicographic title sorting`,
  );
}

// The metadata search fallback renders results in search-data order, so the
// endpoint must order entries through the same comparator.
const searchData = fs.readFileSync(
  path.join(projectRoot, 'src/pages/search-data.json.ts'),
  'utf8',
);
assert.ok(
  searchData.includes('compareTitles('),
  'search-data.json.ts must order entries with compareTitles',
);
assert.ok(
  !searchData.includes('.sort((a, b) => a.title.localeCompare(b.title))'),
  'search-data.json.ts must not fall back to lexicographic title sorting',
);

console.log('title sort check passed');
