import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCanonicalGlossaryLinks, orderGeneratedData, dedupeOutgoingLinks, normalizeArticleCategories, resolveBuildLinkTargets } from './build-linkgraph.js';
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
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [tempo](https://docs.learnbittensor.org/resources/glossary#tempo), [Glossary: Validator Take %](https://docs.learnbittensor.org/resources/glossary#validator-take-), [Public Key glossary](https://docs.learnbittensor.org/resources/glossary#public-key), and [Subnet Hyperparameters](https://docs.learnbittensor.org/subnets/subnet-hyperparameters).',
  ),
  [
    { target: 'tempo', canonicalTarget: '', text: 'tempo', requireExisting: true, skipSelf: true, allowSplitTargets: true },
    {
      target: 'Validator Take %',
      canonicalTarget: 'validator take',
      text: 'Glossary: Validator Take %',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Public Key',
      canonicalTarget: 'public key',
      text: 'Public Key glossary',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve plain labels and keep the glossary anchor text as a fallback candidate for prefixed and glossary-suffixed labels',
);

const resolverSlugMap = {
  dynamic_tao: { title: 'Dynamic TAO' },
  delegate: { title: 'Delegate' },
  epoch: { title: 'Epoch' },
  mev_maximal_extractable_value: {
    title: 'MEV (Maximal Extractable Value)',
    infoboxTitle: 'MEV',
  },
  tempo: { title: 'Tempo' },
  validator_take: { title: 'Validator Take' },
  subnet_validator: { title: 'Subnet Validator' },
  validator_weights: { title: 'Validator Weights' },
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
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'validator take',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['validator_take'],
  'canonical glossary anchor fallbacks should resolve exact local aliases without the plain-text Related splitter',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'subnet validator',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['subnet_validator'],
  'canonical glossary anchor fallbacks should recover existing local aliases like subnet validator when the visible label is shorter',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Introduction to Bittensor',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  [],
  'exact-existing glossary recovery must not fall back to the plain-text Related splitter when no local alias exists',
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
    { target: 'alpha', text: 'Glossary: A' },
    { target: 'alpha', text: 'B' },
    { target: 'beta', text: 'B' },
    { target: '', text: 'Empty' },
  ]),
  [
    { target: 'alpha', text: 'B' },
    { target: 'beta', text: 'B' },
  ],
  'outgoing link targets must be deduped after alias resolution while preferring a later non-Glossary label for the same target',
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
    (linkGraph.activity_cutoff || []).some((entry) => entry.target === 'tempo' && entry.text === 'tempo'),
    'generated linkgraph must recover the current activity_cutoff body link to the local tempo article from a canonical glossary markdown link',
  );
  assert.ok(
    (linkGraph.address_poisoning_scams || []).some((entry) => entry.target === 'public_key' && entry.text === 'Glossary: Public Key'),
    'generated linkgraph must recover the current address_poisoning_scams body link to the local public_key article from a canonical glossary label with a visible Glossary: prefix',
  );
  assert.ok(
    (backlinks.mev_maximal_extractable_value || []).some((entry) => entry.from === 'sandwich_attack'),
    'generated backlinks must list sandwich_attack under the current local MEV article when its Related infobox row points there',
  );
  assert.ok(
    (backlinks.tempo || []).some((entry) => entry.from === 'activity_cutoff'),
    'generated backlinks must list activity_cutoff under tempo when the body uses a canonical glossary markdown link to the local tempo concept',
  );
  assert.ok(
    (backlinks.public_key || []).some((entry) => entry.from === 'address_poisoning_scams'),
    'generated backlinks must list address_poisoning_scams under public_key when the body uses a canonical glossary label with a visible Glossary: prefix',
  );
  assert.ok(
    (linkGraph.wallet_address || []).some((entry) => entry.target === 'public_key' && entry.text === 'Public Key glossary'),
    'generated linkgraph must recover the current wallet_address body link to public_key from a glossary-suffixed visible label',
  );
  assert.ok(
    (linkGraph.transfer || []).some((entry) => entry.target === 'wallet_address' && entry.text === 'Wallet Address glossary'),
    'generated linkgraph must recover the current transfer body link to wallet_address from a glossary-suffixed visible label',
  );
  assert.ok(
    (linkGraph.private_key || []).some((entry) => entry.target === 'eddsa_cryptographic_keypairs' && entry.text === 'EdDSA Cryptographic Keypairs glossary entry'),
    'generated linkgraph must recover the current private_key body link to eddsa_cryptographic_keypairs from a glossary-entry label',
  );
  assert.ok(
    (backlinks.public_key || []).some((entry) => entry.from === 'wallet_address'),
    'generated backlinks must list wallet_address under public_key when the body uses a glossary-suffixed visible label',
  );
  assert.ok(
    (backlinks.wallet_address || []).some((entry) => entry.from === 'transfer'),
    'generated backlinks must list transfer under wallet_address when the body uses a glossary-suffixed visible label',
  );
  assert.ok(
    (linkGraph.delegation || []).some((entry) => entry.target === 'validator_take' && entry.text === 'Glossary: Validator Take %'),
    'generated linkgraph must recover the current delegation body link to validator_take from a prefixed glossary alias whose visible label includes punctuation',
  );
  assert.ok(
    (linkGraph.delegation || []).some((entry) => entry.target === 'subnet_validator' && entry.text === 'Glossary: Validator'),
    'generated linkgraph must recover the current delegation body link to subnet_validator when the prefixed glossary label is shorter than the local title',
  );
  assert.ok(
    (linkGraph.hotkeys || []).some((entry) => entry.target === 'weight_vector' && entry.text === 'Glossary: Weights'),
    'generated linkgraph must recover the current hotkeys body link to weight_vector when the prefixed glossary label is a shorter alias of the canonical concept',
  );
  assert.ok(
    (backlinks.validator_take || []).some((entry) => entry.from === 'delegation'),
    'generated backlinks must list delegation under validator_take when a prefixed glossary alias falls back to the canonical glossary anchor',
  );
  assert.ok(
    !(linkGraph.tempo || []).some((entry) => entry.target === 'tempo'),
    'generated linkgraph must not create a self-link when a glossary markdown link names the current article itself',
  );
  assert.ok(
    !(linkGraph.mainchain || []).some((entry) => entry.target === 'mainchain'),
    'generated linkgraph must not create a self-link when a visible Glossary: label names the current article itself',
  );
}

console.log('Linkgraph generated-data order check passed');
