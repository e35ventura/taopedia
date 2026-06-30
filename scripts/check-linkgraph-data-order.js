import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { orderGeneratedData, dedupeOutgoingLinks, normalizeArticleCategories, resolveBuildLinkTargets } from './build-linkgraph.js';
import { buildSlugAliases } from './wiki-link-resolver.js';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(projectRoot, 'public', 'data');
const compareKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

assert.deepEqual(
  normalizeArticleCategories(['Mining', 'Consensus', 'Mining']),
  ['Mining', 'Consensus'],
  'normalizeArticleCategories must dedupe while preserving first-seen order',
);
assert.deepEqual(normalizeArticleCategories(undefined), [], 'normalizeArticleCategories must normalize missing input to []');

const resolverSlugMap = {
  dynamic_tao: { title: 'Dynamic TAO' },
  delegate: { title: 'Delegate' },
  mev_maximal_extractable_value: {
    title: 'MEV (Maximal Extractable Value)',
    infoboxTitle: 'MEV',
  },
};
const resolverAliases = buildSlugAliases(resolverSlugMap);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Delegate',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  ['delegate'],
  'plain-text Related infobox rows must resolve to an existing local Taopedia article slug',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'MEV',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  ['mev_maximal_extractable_value'],
  'plain-text Related infobox rows must resolve short infoboxTitle aliases like MEV to an existing local slug',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Introduction to Bittensor',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  [],
  'plain-text Related infobox rows without a local article match must stay out of the link graph',
);

function assertSortedKeys(object, label) {
  const keys = Object.keys(object);
  assert.deepEqual(keys, [...keys].sort(compareKeys), `${label} keys must be sorted with numeric collation`);
}

function assertSortedValues(values, label) {
  assert.deepEqual(values, [...values].sort(compareKeys), `${label} must be sorted with numeric collation`);
}

const input = {
  linkGraph: {
    subnet_10: [{ target: 'wallets', text: 'Wallets' }],
    alpha: [],
    subnet_2: [{ target: 'coldkeys', text: 'Coldkeys' }],
  },
  backlinks: {
    wallets: [
      { from: 'subnet_10', fromTitle: 'Subnet 10' },
      { from: 'alpha', fromTitle: 'Alpha' },
      { from: 'subnet_2', fromTitle: 'Subnet 2' },
    ],
    coldkeys: [{ from: 'subnet_10', fromTitle: 'Subnet 10' }],
  },
  slugMap: {
    subnet_10: { title: 'Subnet 10' },
    alpha: { title: 'Alpha' },
    subnet_2: { title: 'Subnet 2' },
  },
  categoryIndex: {
    // 'subnet_10' is repeated to exercise per-category member de-duping (an article
    // whose frontmatter lists the same category twice would otherwise appear twice).
    Subnets: ['subnet_10', 'subnet_2', 'subnet_10'],
    Consensus: ['yuma_consensus', 'alpha'],
  },
};

const ordered = orderGeneratedData(input);

assertSortedKeys(ordered.linkGraph, 'linkgraph');
assert.deepEqual(Object.keys(ordered.linkGraph), ['alpha', 'subnet_2', 'subnet_10']);
assertSortedKeys(ordered.slugMap, 'slugmap');
assert.deepEqual(Object.keys(ordered.slugMap), ['alpha', 'subnet_2', 'subnet_10']);
assertSortedKeys(ordered.backlinks, 'backlink target');
assert.deepEqual(Object.keys(ordered.backlinks), ['coldkeys', 'wallets']);
assert.deepEqual(
  ordered.backlinks.wallets.map((entry) => entry.from),
  ['alpha', 'subnet_2', 'subnet_10'],
  'backlink rows must be sorted by source slug with numeric collation',
);
assertSortedKeys(ordered.categoryIndex, 'category index');
assert.deepEqual(Object.keys(ordered.categoryIndex), ['Consensus', 'Subnets']);
assert.deepEqual(
  ordered.categoryIndex.Subnets,
  ['subnet_2', 'subnet_10'],
  'category member slugs must be sorted with numeric collation and de-duped',
);

assert.deepEqual(
  input.backlinks.wallets.map((entry) => entry.from),
  ['subnet_10', 'alpha', 'subnet_2'],
  'ordering helper must not mutate caller-owned backlink arrays',
);
assert.deepEqual(
  input.categoryIndex.Subnets,
  ['subnet_10', 'subnet_2', 'subnet_10'],
  'ordering helper must not mutate caller-owned category arrays',
);

assert.deepEqual(
  dedupeOutgoingLinks([
    { target: 'alpha', text: 'A' },
    { target: 'alpha', text: 'B' },
    { target: 'beta', text: 'B' },
    { target: '', text: 'Empty' },
  ]),
  [
    { target: 'alpha', text: 'A' },
    { target: 'beta', text: 'B' },
  ],
  'outgoing link targets must be deduped after alias resolution',
);

const generatedFiles = ['linkgraph.json', 'backlinks.json', 'slugmap.json', 'categories.json']
  .map((file) => path.join(dataDir, file));

if (generatedFiles.every((file) => fs.existsSync(file))) {
  const linkGraph = JSON.parse(fs.readFileSync(path.join(dataDir, 'linkgraph.json'), 'utf8'));
  const backlinks = JSON.parse(fs.readFileSync(path.join(dataDir, 'backlinks.json'), 'utf8'));
  const slugMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'slugmap.json'), 'utf8'));
  const categoryIndex = JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf8'));

  assertSortedKeys(linkGraph, 'generated linkgraph');
  assertSortedKeys(backlinks, 'generated backlinks');
  assertSortedKeys(slugMap, 'generated slugmap');
  assertSortedKeys(categoryIndex, 'generated category index');

  for (const [target, entries] of Object.entries(backlinks)) {
    assertSortedValues(entries.map((entry) => entry.from), `generated backlinks for ${target}`);
  }
  for (const [category, slugs] of Object.entries(categoryIndex)) {
    assertSortedValues(slugs, `generated category members for ${category}`);
    assert.equal(
      new Set(slugs).size,
      slugs.length,
      `generated category members for ${category} must not repeat a slug`,
    );
  }
  for (const [slug, entry] of Object.entries(slugMap)) {
    const categories = Array.isArray(entry?.categories) ? entry.categories : [];
    assert.equal(
      new Set(categories).size,
      categories.length,
      `generated slugmap entry for ${slug} must not repeat a category tag`,
    );
  }
  assert.ok(
    (linkGraph.sandwich_attack || []).some((entry) => entry.target === 'mev_maximal_extractable_value' && entry.text === 'MEV'),
    'generated linkgraph must keep the current sandwich_attack Related: MEV infobox edge when the local MEV article exists',
  );
  assert.ok(
    (backlinks.mev_maximal_extractable_value || []).some((entry) => entry.from === 'sandwich_attack'),
    'generated backlinks must list sandwich_attack under the current local MEV article when its Related infobox row points there',
  );
}

console.log('Linkgraph generated-data order check passed');
