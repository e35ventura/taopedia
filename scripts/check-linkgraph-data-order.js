import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderGeneratedData } from './build-linkgraph.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = path.join(projectRoot, 'public', 'data');
const compareKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

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
    Subnets: ['subnet_10', 'subnet_2'],
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
  'category member slugs must be sorted with numeric collation',
);

assert.deepEqual(
  input.backlinks.wallets.map((entry) => entry.from),
  ['subnet_10', 'alpha', 'subnet_2'],
  'ordering helper must not mutate caller-owned backlink arrays',
);
assert.deepEqual(
  input.categoryIndex.Subnets,
  ['subnet_10', 'subnet_2'],
  'ordering helper must not mutate caller-owned category arrays',
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
  }
}

console.log('Linkgraph generated-data order check passed');
