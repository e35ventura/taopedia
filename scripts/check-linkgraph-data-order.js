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
    'See [tempo](https://docs.learnbittensor.org/resources/glossary#tempo), [Glossary: Validator Take %](https://docs.learnbittensor.org/resources/glossary#validator-take-), [Glossary: Drand/time-lock encryption](https://docs.learnbittensor.org/resources/glossary#drandtime-lock-encryption), [Glossary: Root Subnet/Subnet Zero](https://docs.learnbittensor.org/resources/glossary#root-subnetsubnet-zero), [Glossary: Exponential Moving Average (EMA)](https://docs.learnbittensor.org/resources/glossary#exponential-moving-average-ema), [Glossary: ADR](https://docs.learnbittensor.org/resources/glossary#adr-alpha-distribution-ratio), and [Subnet Hyperparameters](https://docs.learnbittensor.org/subnets/subnet-hyperparameters).',
  ),
  [
    { target: 'tempo', alternateTarget: '', canonicalTarget: '', text: 'tempo', requireExisting: true, skipSelf: true, allowSplitTargets: true },
    {
      target: 'Validator Take %',
      alternateTarget: '',
      canonicalTarget: 'validator take',
      text: 'Glossary: Validator Take %',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Drand time-lock encryption',
      alternateTarget: 'Drand',
      canonicalTarget: 'drandtime lock encryption',
      text: 'Glossary: Drand/time-lock encryption',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Root Subnet Subnet Zero',
      alternateTarget: 'Root Subnet',
      canonicalTarget: 'root subnetsubnet zero',
      text: 'Glossary: Root Subnet/Subnet Zero',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Exponential Moving Average (EMA)',
      alternateTarget: '',
      canonicalTarget: 'exponential moving average ema',
      text: 'Glossary: Exponential Moving Average (EMA)',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'ADR',
      alternateTarget: '',
      canonicalTarget: 'alpha distribution ratio',
      text: 'Glossary: ADR',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve plain labels, keep prefixed-label anchor fallbacks, normalize slash-separated labels, preserve a first visible slash alternative, and keep acronym-bearing prefixed labels available for later exact-only fallback refinement',
);

const resolverSlugMap = {
  dynamic_tao: { title: 'Dynamic TAO' },
  delegate: { title: 'Delegate' },
  drand_time_lock_encryption: { title: 'Drand Time-Lock Encryption' },
  epoch: { title: 'Epoch' },
  mev_maximal_extractable_value: {
    title: 'MEV (Maximal Extractable Value)',
    infoboxTitle: 'MEV',
  },
  tempo: { title: 'Tempo' },
  validator_take: { title: 'Validator Take' },
  subnet_validator: { title: 'Subnet Validator' },
  validator_weights: { title: 'Validator Weights' },
  root_subnet: { title: 'Root Subnet' },
  alpha_distribution_ratio: { title: 'Alpha Distribution Ratio' },
  exponential_moving_averages: { title: 'Exponential Moving Averages', infoboxTitle: 'Exponential Moving Averages' },
  hotkey_coldkey_pair: { title: 'Hotkey-Coldkey Pair' },
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
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Drand time-lock encryption',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['drand_time_lock_encryption'],
  'exact-existing glossary recovery should match a slash-normalized visible glossary label to the local article',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Root Subnet',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['root_subnet'],
  'exact-existing glossary recovery should match the first visible slash alternative when the combined prefixed label misses',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'alpha distribution ratio',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['alpha_distribution_ratio'],
  'exact-existing glossary recovery should resolve a canonical glossary anchor after a redundant leading acronym has been stripped',
);
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [Glossary: Coldkey-hotkey pair](https://docs.learnbittensor.org/resources/glossary#coldkey-hotkey-pair).',
  ),
  [
    {
      target: 'Coldkey-hotkey pair',
      alternateTarget: 'hotkey-Coldkey pair',
      canonicalTarget: 'coldkey hotkey pair',
      text: 'Glossary: Coldkey-hotkey pair',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve a hyphen-reversed first compound as an alternate fallback',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'hotkey-Coldkey pair',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['hotkey_coldkey_pair'],
  'exact-existing glossary recovery should match a hyphen-reversed first compound when the visible prefixed label misses',
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
    (linkGraph.activity_cutoff || []).some((entry) => entry.target === 'tempo' && entry.text === 'Glossary: Tempo'),
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
    (linkGraph.commit_reveal || []).some((entry) => entry.target === 'drand_time_lock_encryption' && entry.text === 'Glossary: Drand/time-lock encryption'),
    'generated linkgraph must recover the current commit_reveal body link to drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (linkGraph.weight_copying || []).some((entry) => entry.target === 'drand_time_lock_encryption' && entry.text === 'Glossary: Drand/time-lock encryption'),
    'generated linkgraph must recover the current weight_copying body link to drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (linkGraph.netuid || []).some((entry) => entry.target === 'root_subnet' && entry.text === 'Glossary: Root Subnet/Subnet Zero'),
    'generated linkgraph must recover the current netuid body link to root_subnet when the slash-normalized prefixed glossary label misses but its first visible alternative matches the local article',
  );
  assert.ok(
    (linkGraph.alpha_staker || []).some((entry) => entry.target === 'root_subnet' && entry.text === 'Glossary: Root Subnet/Subnet Zero'),
    'generated linkgraph must recover the current alpha_staker body link to root_subnet when the slash-normalized prefixed glossary label misses but its first visible alternative matches the local article',
  );
  assert.ok(
    (linkGraph.validator_miner_bonds || []).some((entry) => entry.target === 'exponential_moving_averages' && entry.text === 'Glossary: Exponential Moving Average (EMA)'),
    'generated linkgraph must recover the current validator_miner_bonds body link to exponential_moving_averages when the prefixed glossary label ends with a parenthetical acronym but the local article title is pluralized',
  );
  assert.ok(
    (linkGraph.yuma_consensus_3 || []).some((entry) => entry.target === 'exponential_moving_averages' && entry.text === 'Glossary: Exponential Moving Average (EMA)'),
    'generated linkgraph must recover the current yuma_consensus_3 body link to exponential_moving_averages when the prefixed glossary label ends with a parenthetical acronym but the local article title is pluralized',
  );
  assert.ok(
    (linkGraph.alpha_outstanding || []).some((entry) => entry.target === 'alpha_distribution_ratio' && entry.text === 'Glossary: ADR'),
    'generated linkgraph must recover the current alpha_outstanding body link to alpha_distribution_ratio when the visible glossary label is an acronym that is redundantly repeated at the start of the canonical anchor',
  );
  assert.ok(
    (linkGraph.halving_mechanisms || []).some((entry) => entry.target === 'alpha_distribution_ratio' && entry.text === 'Glossary: ADR'),
    'generated linkgraph must recover the current halving_mechanisms body link to alpha_distribution_ratio when the visible glossary label is an acronym that is redundantly repeated at the start of the canonical anchor',
  );
  assert.ok(
    (linkGraph.hotkey_swap || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey pair'),
    'generated linkgraph must recover the current hotkey_swap body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (linkGraph.wallets_coldkey_hotkey || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey pair'),
    'generated linkgraph must recover the current wallets_coldkey_hotkey body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (linkGraph.coldkey_hotkey_workstation_security || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey Pair'),
    'generated linkgraph must recover the current coldkey_hotkey_workstation_security body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (backlinks.validator_take || []).some((entry) => entry.from === 'delegation'),
    'generated backlinks must list delegation under validator_take when a prefixed glossary alias falls back to the canonical glossary anchor',
  );
  assert.ok(
    (backlinks.drand_time_lock_encryption || []).some((entry) => entry.from === 'commit_reveal'),
    'generated backlinks must list commit_reveal under drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (backlinks.root_subnet || []).some((entry) => entry.from === 'netuid'),
    'generated backlinks must list netuid under root_subnet when a prefixed glossary slash label falls back to its first visible local alternative',
  );
  assert.ok(
    (backlinks.root_subnet || []).some((entry) => entry.from === 'alpha_staker'),
    'generated backlinks must list alpha_staker under root_subnet when a prefixed glossary slash label falls back to its first visible local alternative',
  );
  assert.ok(
    (backlinks.exponential_moving_averages || []).some((entry) => entry.from === 'validator_miner_bonds'),
    'generated backlinks must list validator_miner_bonds under exponential_moving_averages when a prefixed glossary acronym-parenthetical label falls back to the local plural concept article',
  );
  assert.ok(
    (backlinks.exponential_moving_averages || []).some((entry) => entry.from === 'yuma_consensus_3'),
    'generated backlinks must list yuma_consensus_3 under exponential_moving_averages when a prefixed glossary acronym-parenthetical label falls back to the local plural concept article',
  );
  assert.ok(
    (backlinks.alpha_distribution_ratio || []).some((entry) => entry.from === 'alpha_outstanding'),
    'generated backlinks must list alpha_outstanding under alpha_distribution_ratio when a prefixed glossary acronym falls back to the stripped canonical anchor',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'hotkey_swap'),
    'generated backlinks must list hotkey_swap under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'wallets_coldkey_hotkey'),
    'generated backlinks must list wallets_coldkey_hotkey under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'coldkey_hotkey_workstation_security'),
    'generated backlinks must list coldkey_hotkey_workstation_security under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    !(linkGraph.tempo || []).some((entry) => entry.target === 'tempo'),
    'generated linkgraph must not create a self-link when a glossary markdown link names the current article itself',
  );
  assert.ok(
    !(linkGraph.mainchain || []).some((entry) => entry.target === 'mainchain'),
    'generated linkgraph must not create a self-link when a visible Glossary: label names the current article itself',
  );
  assert.ok(
    !(linkGraph.drand_time_lock_encryption || []).some((entry) => entry.target === 'drand_time_lock_encryption'),
    'generated linkgraph must not create a self-link when a slash-separated visible glossary label names the current article itself',
  );
  assert.ok(
    !(linkGraph.root_subnet || []).some((entry) => entry.target === 'root_subnet'),
    'generated linkgraph must not create a self-link when a slash-separated prefixed glossary label names the current article itself via its first visible local alternative',
  );
  assert.ok(
    !(linkGraph.alpha_distribution_ratio || []).some((entry) => entry.target === 'alpha_distribution_ratio'),
    'generated linkgraph must not create a self-link when a prefixed glossary acronym names the current article itself',
  );
}

console.log('Linkgraph generated-data order check passed');
